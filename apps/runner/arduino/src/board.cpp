// ARC LABS virtual Arduino board: simulated clock, pins, sensors and the Serial Monitor.
//
// The test case input (stdin) describes the world, one setting per line:
//
//   temp=31            DHT temperature (°C)          humidity=70     DHT humidity (%)
//   D2=LOW             digital input on pin 2        A0=512          analog input (0–1023)
//   distance=25        HC-SR04 distance (cm)         pulse=1500      any pulseIn() result (µs)
//   serial=hello\n     text typed into the Serial Monitor
//   time=5000          how long to run (ms, default 3000)
//   trace=pins         also print output-pin changes, PWM, tone and servo moves
//   dht=error          DHT sensor not responding     dht_pin=2 / dht_type=22  (for bit-banging)
//   @1500 D2=LOW       change something at 1500 ms   (several: @1500 temp=40, humidity=20)
//
// Serial output (and trace lines) go to stdout; the LCD's final screen is printed at the end.

#include <Arduino.h>
#include <stdarg.h>
#include <unistd.h>

#include <algorithm>
#include <map>
#include <string>
#include <vector>

HardwareSerial Serial(0);
HardwareSerial Serial1(1);
HardwareSerial Serial2(2);

namespace {

struct Event {
  uint64_t at;
  std::string key;
  std::string value;
};

uint64_t now_us = 0;
uint64_t end_us = 3000000;
bool trace_on = false;
bool finishing = false;
int last_char = '\n';
unsigned long baud_us_per_char = 1042;  // 9600 baud

std::map<std::string, double> world;
std::vector<Event> schedule;
size_t next_event = 0;
std::string serial_in;
size_t serial_pos = 0;
std::vector<void (*)()> &lcdDumps() {  // function-local: safe during static initialisation
  static std::vector<void (*)()> v;
  return v;
}
std::vector<int> watch_pins;  // trace=D7 → only these pins; empty + trace_on → all pins

uint8_t pin_mode[64];
uint8_t pin_out[64];
void (*isr_fn[64])() = {nullptr};
int isr_mode[64];

// DHT bit-bang model
int dht_pin = -1;
int dht_type = 11;
int64_t dht_low_since = -1;
int64_t dht_start = -1;
std::vector<std::pair<int, int>> dht_wave;  // (level, duration µs)

std::string lower(std::string s) {
  for (auto &c : s) c = tolower((unsigned char)c);
  return s;
}

std::string canon(std::string k) {
  k = lower(k);
  if (k == "temperature" || k == "t") return "temp";
  if (k == "hum" || k == "h" || k == "humid") return "humidity";
  if (k == "distance_cm" || k == "dist") return "distance";
  if (k == "pulse_us") return "pulse";
  if (k == "duration") return "time";
  if (k.rfind("pin", 0) == 0 && k.size() > 3 && isdigit((unsigned char)k[3])) return "d" + k.substr(3);
  return k;
}

double parseValue(const std::string &raw) {
  std::string v = lower(raw);
  if (v == "high" || v == "on" || v == "true") return 1;
  if (v == "low" || v == "off" || v == "false") return 0;
  return atof(v.c_str());
}

std::string unescape(const std::string &s) {
  std::string out;
  for (size_t i = 0; i < s.size(); i++) {
    if (s[i] == '\\' && i + 1 < s.size()) {
      char n = s[++i];
      out += n == 'n' ? '\n' : n == 't' ? '\t' : n == 'r' ? '\r' : n;
    } else
      out += s[i];
  }
  return out;
}

std::string trim(const std::string &s) {
  size_t a = s.find_first_not_of(" \t\r\n");
  if (a == std::string::npos) return "";
  size_t b = s.find_last_not_of(" \t\r\n");
  return s.substr(a, b - a + 1);
}

int pinFromKey(const std::string &k, char prefix) {
  if (k.size() < 2 || k[0] != prefix) return -1;
  for (size_t i = 1; i < k.size(); i++)
    if (!isdigit((unsigned char)k[i])) return -1;
  return atoi(k.c_str() + 1);
}

void emit(int c) {
  putchar(c);
  last_char = c;
}

void applySetting(const std::string &key, const std::string &value, bool timed);

void applyDue(uint64_t upto) {
  while (next_event < schedule.size() && schedule[next_event].at <= upto) {
    const Event &e = schedule[next_event++];
    now_us = std::max(now_us, e.at);
    applySetting(e.key, e.value, true);
  }
}

void finish() {
  if (finishing) return;
  finishing = true;
  for (auto dump : lcdDumps()) dump();
  fflush(stdout);
  exit(0);
}

void buildDhtWave() {
  double t = sim::value("temp", 25), h = sim::value("humidity", 50);
  uint8_t b[5];
  if (dht_type == 22) {
    int H = (int)lround(h * 10), T = (int)lround(fabs(t) * 10);
    if (t < 0) T |= 0x8000;
    b[0] = H >> 8;
    b[1] = H & 0xff;
    b[2] = T >> 8;
    b[3] = T & 0xff;
  } else {
    b[0] = (uint8_t)lround(h);
    b[1] = 0;
    b[2] = (uint8_t)floor(t);
    b[3] = (uint8_t)((int)lround((t - floor(t)) * 10) % 10);
  }
  b[4] = (uint8_t)(b[0] + b[1] + b[2] + b[3]);
  dht_wave.clear();
  dht_wave.push_back({HIGH, 30});
  dht_wave.push_back({LOW, 80});
  dht_wave.push_back({HIGH, 80});
  for (int i = 0; i < 40; i++) {
    int bitv = (b[i / 8] >> (7 - i % 8)) & 1;
    dht_wave.push_back({LOW, 50});
    dht_wave.push_back({HIGH, bitv ? 70 : 26});
  }
  dht_wave.push_back({LOW, 50});
}

int dhtLevel() {
  if (dht_start < 0) return HIGH;
  int64_t rel = (int64_t)now_us - dht_start;
  for (auto &seg : dht_wave) {
    if (rel < seg.second) return seg.first;
    rel -= seg.second;
  }
  dht_start = -1;  // transmission over; line idles high
  return HIGH;
}

void dhtHostReleased() {
  if (dht_low_since >= 0 && (int64_t)now_us - dht_low_since >= 800 && !sim::has("dht")) {
    buildDhtWave();
    dht_start = (int64_t)now_us;
  }
  dht_low_since = -1;
}

bool watching(int pin) {
  return trace_on && (watch_pins.empty() || std::find(watch_pins.begin(), watch_pins.end(), pin) != watch_pins.end());
}

const char *pinName(int pin) {
  static char buf[8];
  if (pin >= A0 && pin <= A7)
    snprintf(buf, sizeof buf, "A%d", pin - A0);
  else
    snprintf(buf, sizeof buf, "D%d", pin);
  return buf;
}

int inputLevel(int pin) {
  char key[8];
  snprintf(key, sizeof key, "d%d", pin);
  auto it = world.find(key);
  if (it != world.end()) return it->second != 0 ? HIGH : LOW;
  return pin_mode[pin] == INPUT_PULLUP ? HIGH : LOW;
}

void applySetting(const std::string &rawKey, const std::string &value, bool timed) {
  std::string key = canon(rawKey);
  if (key == "serial") {
    serial_in += unescape(value);
    return;
  }
  if (key == "trace") {
    // trace=pins (everything) · trace=D7 / trace=D7+D8 (only those pins) · trace=off
    std::string v = lower(value);
    trace_on = !(v == "off" || v == "no" || v == "false" || v == "0");
    size_t start = 0;
    while (trace_on && start <= v.size()) {
      size_t plus = v.find('+', start);
      std::string part = trim(v.substr(start, plus == std::string::npos ? std::string::npos : plus - start));
      int p = pinFromKey(part, 'd');
      int a = pinFromKey(part, 'a');
      if (p >= 0) watch_pins.push_back(p);
      if (a >= 0) watch_pins.push_back(A0 + a);
      if (plus == std::string::npos) break;
      start = plus + 1;
    }
    return;
  }
  if (key == "dht") {
    if (lower(value) == "error")
      world["dht"] = 1;
    else
      world.erase("dht");
    return;
  }
  if (key == "time" && !timed) {
    end_us = (uint64_t)(std::max(1.0, std::min(600000.0, parseValue(value))) * 1000);
    return;
  }
  if (key == "dht_pin" && !timed) {
    dht_pin = (int)parseValue(value);
    return;
  }
  if (key == "dht_type" && !timed) {
    dht_type = (int)parseValue(value) == 22 ? 22 : 11;
    return;
  }
  int apin = pinFromKey(key, 'a');
  if (apin >= 0) key = "a" + std::to_string(apin);
  int dpin = pinFromKey(key, 'd');
  double v = parseValue(value);
  int before = dpin >= 0 && dpin < 64 ? inputLevel(dpin) : 0;
  world[key] = v;
  if (dpin >= 0 && dpin < 64 && isr_fn[dpin]) {
    int after = inputLevel(dpin);
    int m = isr_mode[dpin];
    if (before != after && (m == CHANGE || (m == RISING && after == HIGH) || (m == FALLING && after == LOW)))
      isr_fn[dpin]();
  }
}

void parseWorld() {
  std::string all;
  char buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, stdin)) > 0) all.append(buf, n);
  size_t pos = 0;
  while (pos <= all.size()) {
    size_t nl = all.find('\n', pos);
    std::string line = trim(all.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos));
    pos = nl == std::string::npos ? all.size() + 1 : nl + 1;
    if (line.empty() || line[0] == '#') continue;
    uint64_t at = 0;
    bool timed = false;
    if (line[0] == '@') {
      char *end = nullptr;
      double ms = strtod(line.c_str() + 1, &end);
      at = (uint64_t)(ms * 1000);
      timed = true;
      line = trim(std::string(end));
      if (!line.empty() && line[0] == ':') line = trim(line.substr(1));
      if (lower(line).rfind("ms", 0) == 0) line = trim(line.substr(2));
    }
    // "a=1, b=2" or "a=1 b=2" — but serial text keeps everything after its '='
    std::vector<std::string> parts;
    size_t sp = lower(line).find("serial");
    if (sp == 0) {
      parts.push_back(line);
    } else {
      std::string cur;
      for (char c : line) {
        if (c == ',' || c == ';' || c == ' ' || c == '\t') {
          if (!cur.empty()) parts.push_back(cur);
          cur.clear();
        } else
          cur += c;
      }
      if (!cur.empty()) parts.push_back(cur);
    }
    for (auto &p : parts) {
      size_t eq = p.find_first_of("=:");
      if (eq == std::string::npos) continue;
      std::string k = trim(p.substr(0, eq)), v = trim(p.substr(eq + 1));
      if (lower(k) == "serial") v = p.substr(eq + 1);
      if (timed)
        schedule.push_back({at, k, v});
      else
        applySetting(k, v, false);
    }
  }
  std::stable_sort(schedule.begin(), schedule.end(),
                   [](const Event &a, const Event &b) { return a.at < b.at; });
}

uint32_t rng = 1;

}  // namespace

// ───────── simulator hooks ─────────
namespace sim {
void advance(uint64_t us) {
  if (finishing) return;
  uint64_t target = now_us + us;
  applyDue(std::min(target, end_us));
  now_us = target;
  if (now_us >= end_us) finish();
}
double value(const char *key, double fallback) {
  auto it = world.find(canon(key));
  return it == world.end() ? fallback : it->second;
}
bool has(const char *key) { return world.count(canon(key)) > 0; }
bool trace() { return trace_on; }
bool tracePin(int pin) { return watching(pin); }
void traceLine(const char *fmt, ...) {
  if (!trace_on || finishing) return;
  if (last_char != '\n') emit('\n');
  printf("[%lu ms] ", (unsigned long)(now_us / 1000));
  va_list ap;
  va_start(ap, fmt);
  vprintf(fmt, ap);
  va_end(ap);
  emit('\n');
}
void registerLcd(void (*dump)()) {
  auto &v = lcdDumps();
  if (std::find(v.begin(), v.end(), dump) == v.end()) v.push_back(dump);
}
}  // namespace sim

// ───────── Arduino API ─────────
long map(long x, long in_min, long in_max, long out_min, long out_max) {
  if (in_max == in_min) return out_min;
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

void pinMode(uint8_t pin, uint8_t mode) {
  if (pin >= 64) return;
  pin_mode[pin] = mode;
  if (pin == dht_pin) {
    if (mode == OUTPUT) {
      if (pin_out[pin] == LOW) dht_low_since = (int64_t)now_us;
    } else
      dhtHostReleased();
  }
}

void digitalWrite(uint8_t pin, uint8_t val) {
  sim::advance(4);
  if (pin >= 64) return;
  val = val ? HIGH : LOW;
  if (pin_mode[pin] != OUTPUT) {  // writing HIGH to an input turns on the pull-up
    pin_out[pin] = val;
    return;
  }
  if (pin == dht_pin) {
    if (val == LOW && pin_out[pin] != LOW) dht_low_since = (int64_t)now_us;
    if (val == HIGH) dhtHostReleased();
  }
  if (pin_out[pin] != val && watching(pin)) sim::traceLine("%s %s", pinName(pin), val ? "HIGH" : "LOW");
  pin_out[pin] = val;
}

int digitalRead(uint8_t pin) {
  sim::advance(4);
  if (pin >= 64) return LOW;
  if (pin == dht_pin && pin_mode[pin] != OUTPUT) return dhtLevel();
  if (pin_mode[pin] == OUTPUT) return pin_out[pin];
  return inputLevel(pin);
}

static int analog_bits = 10;
void analogReadResolution(int bits) { analog_bits = constrain(bits, 1, 16); }
void analogReference(uint8_t) {}

int analogRead(uint8_t pin) {
  sim::advance(100);
  if (pin < A0) pin += A0;
  char key[8];
  snprintf(key, sizeof key, "a%d", pin - A0);
  double v = sim::value(key, 0);
  long maxv = (1L << analog_bits) - 1;
  // Test cases give 0–1023 (10-bit); scale if the sketch asked for another resolution.
  long scaled = analog_bits == 10 ? lround(v) : lround(v * maxv / 1023.0);
  return (int)constrain(scaled, 0L, maxv);
}

void analogWrite(uint8_t pin, int val) {
  sim::advance(4);
  if (pin < 64) pin_mode[pin] = OUTPUT;
  if (watching(pin)) sim::traceLine("%s PWM %d", pinName(pin), val);
}

unsigned long millis() {
  sim::advance(1);
  return (unsigned long)(now_us / 1000);
}
unsigned long micros() {
  sim::advance(1);
  return (unsigned long)now_us;
}
void delay(unsigned long ms) { sim::advance((uint64_t)ms * 1000); }
void delayMicroseconds(unsigned int us) { sim::advance(us); }

unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout) {
  (void)pin;
  (void)state;
  sim::advance(10);
  double us = -1;
  if (sim::has("pulse"))
    us = sim::value("pulse", 0);
  else if (sim::has("distance"))
    us = sim::value("distance", 0) * 2 / 0.034;  // speed of sound 340 m/s, there and back
  if (us < 0 || us > timeout) {
    sim::advance(std::min<unsigned long>(timeout, 1000000UL));
    return 0;
  }
  // Round up so the usual formulas (x0.034/2, /58, /29/2) land on the whole distance.
  unsigned long r = (unsigned long)ceil(us);
  sim::advance(r);
  return r;
}
unsigned long pulseInLong(uint8_t pin, uint8_t state, unsigned long timeout) {
  return pulseIn(pin, state, timeout);
}

void tone(uint8_t pin, unsigned int frequency, unsigned long duration) {
  if (!watching(pin)) return;
  if (duration)
    sim::traceLine("%s tone %u Hz for %lu ms", pinName(pin), frequency, duration);
  else
    sim::traceLine("%s tone %u Hz", pinName(pin), frequency);
}
void noTone(uint8_t pin) {
  if (watching(pin)) sim::traceLine("%s tone off", pinName(pin));
}

void shiftOut(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder, uint8_t val) {
  (void)clockPin;
  (void)bitOrder;
  sim::advance(100);
  if (watching(dataPin)) sim::traceLine("%s shiftOut 0x%02X", pinName(dataPin), val);
}
uint8_t shiftIn(uint8_t, uint8_t, uint8_t) {
  sim::advance(100);
  return 0;
}

void attachInterrupt(uint8_t pin, void (*isr)(void), int mode) {
  if (pin < 64) {
    isr_fn[pin] = isr;
    isr_mode[pin] = mode;
  }
}
void detachInterrupt(uint8_t pin) {
  if (pin < 64) isr_fn[pin] = nullptr;
}

long random(long howbig) {
  if (howbig <= 0) return 0;
  rng = rng * 1103515245u + 12345u;
  return (long)((rng >> 1) % (unsigned long)howbig);
}
long random(long howsmall, long howbig) {
  if (howsmall >= howbig) return howsmall;
  return random(howbig - howsmall) + howsmall;
}
void randomSeed(unsigned long seed) {
  (void)seed;  // deterministic on purpose: every run of a test must print the same thing
}

char *dtostrf(double val, signed char width, unsigned char prec, char *sout) {
  sprintf(sout, "%*.*f", width, prec, val);
  return sout;
}
char *ltoa(long value, char *str, int base) {
  strcpy(str, String(value, (unsigned char)base).c_str());
  return str;
}
char *itoa(int value, char *str, int base) { return ltoa(value, str, base); }

// ───────── Print / Stream / Serial ─────────
size_t Print::printf(const char *fmt, ...) {
  char buf[512];
  va_list ap;
  va_start(ap, fmt);
  int n = vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  write(buf);
  return n < 0 ? 0 : (size_t)n;
}

size_t HardwareSerial::write(uint8_t c) {
  if (id_ != 0 || finishing) return 1;
  if (c != '\r') emit(c);
  sim::advance(baud_us_per_char);  // sending takes time on a real board
  return 1;
}
int HardwareSerial::available() {
  sim::advance(1);
  return id_ == 0 ? (int)(serial_in.size() - serial_pos) : 0;
}
int HardwareSerial::read() {
  if (id_ != 0 || serial_pos >= serial_in.size()) return -1;
  return (unsigned char)serial_in[serial_pos++];
}
int HardwareSerial::peek() {
  if (id_ != 0 || serial_pos >= serial_in.size()) return -1;
  return (unsigned char)serial_in[serial_pos];
}

long Stream::parseInt() {
  int c;
  while ((c = peek()) != -1 && !(isdigit(c) || c == '-')) read();
  bool neg = false;
  long v = 0;
  if (peek() == '-') {
    neg = true;
    read();
  }
  while ((c = peek()) != -1 && isdigit(c)) v = v * 10 + (read() - '0');
  return neg ? -v : v;
}
float Stream::parseFloat() {
  int c;
  while ((c = peek()) != -1 && !(isdigit(c) || c == '-' || c == '.')) read();
  std::string s;
  while ((c = peek()) != -1 && (isdigit(c) || c == '-' || c == '.')) s += (char)read();
  return (float)atof(s.c_str());
}
String Stream::readString() {
  std::string s;
  int c;
  while ((c = read()) != -1) s += (char)c;
  return String(s);
}
String Stream::readStringUntil(char terminator) {
  std::string s;
  int c;
  while ((c = read()) != -1 && c != terminator) s += (char)c;
  return String(s);
}
size_t Stream::readBytes(char *buf, size_t n) {
  size_t i = 0;
  int c;
  while (i < n && (c = read()) != -1) buf[i++] = (char)c;
  return i;
}
size_t Stream::readBytesUntil(char term, char *buf, size_t n) {
  size_t i = 0;
  int c;
  while (i < n && (c = read()) != -1 && c != term) buf[i++] = (char)c;
  return i;
}
bool Stream::find(const char *target) {
  std::string rest;
  int c;
  size_t tl = strlen(target);
  while ((c = read()) != -1) {
    rest += (char)c;
    if (rest.size() >= tl && rest.compare(rest.size() - tl, tl, target) == 0) return true;
  }
  return false;
}

// Serial.begin(baud) — the baud rate sets how long printing takes.
extern "C" void __arc_set_baud(unsigned long baud) {
  if (baud >= 300) baud_us_per_char = 10000000UL / baud;
}

// ───────── entry point ─────────
int main() {
  parseWorld();
  applyDue(0);
  setup();
  for (;;) {
    uint64_t before = now_us;
    loop();
    if (now_us == before) sim::advance(10);  // loop() without delays still moves time on
  }
}
