// ARC LABS virtual Arduino board — the Arduino API for exam code, running on a simulated clock.
//
// Students write normal sketches (setup/loop, pinMode, digitalWrite, analogRead, delay,
// Serial.print, DHT, Servo, LCD…). Each test case describes the "world" (sensor values, button
// states, distances, timed changes) and the grader compares what the sketch prints — Serial output,
// and optionally pin changes / LCD contents. Time is simulated: delay(1000) takes no real time.
#pragma once

#include <ctype.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>

typedef uint8_t byte;
typedef bool boolean;
typedef uint16_t word;

#define HIGH 0x1
#define LOW 0x0
#define INPUT 0x0
#define OUTPUT 0x1
#define INPUT_PULLUP 0x2
#define INPUT_PULLDOWN 0x3

#define LED_BUILTIN 13
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
#define A6 20
#define A7 21
#define SDA 18
#define SCL 19

#define DEC 10
#define HEX 16
#define OCT 8
#define BIN 2

#define CHANGE 1
#define FALLING 2
#define RISING 3

#define LSBFIRST 0
#define MSBFIRST 1

#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif
#define HALF_PI 1.5707963267948966192313216916398
#define TWO_PI 6.283185307179586476925286766559
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define RAD_TO_DEG 57.295779513082320876798154814105

#define F(s) (s)
#define PROGMEM
#define PSTR(s) (s)
#define pgm_read_byte(addr) (*(const unsigned char *)(addr))
#define pgm_read_word(addr) (*(const unsigned short *)(addr))
#define digitalPinToInterrupt(p) (p)
#define NOT_AN_INTERRUPT -1

#define sq(x) ((x) * (x))
#define radians(deg) ((deg) * DEG_TO_RAD)
#define degrees(rad) ((rad) * RAD_TO_DEG)
#define lowByte(w) ((uint8_t)((w) & 0xff))
#define highByte(w) ((uint8_t)((w) >> 8))
#define bitRead(value, bit) (((value) >> (bit)) & 0x01)
#define bitSet(value, bit) ((value) |= (1UL << (bit)))
#define bitClear(value, bit) ((value) &= ~(1UL << (bit)))
#define bitToggle(value, bit) ((value) ^= (1UL << (bit)))
#define bitWrite(value, bit, bitvalue) ((bitvalue) ? bitSet(value, bit) : bitClear(value, bit))
#define bit(b) (1UL << (b))

template <class T, class U>
inline auto min(T a, U b) -> decltype(a < b ? a : b) {
  return a < b ? a : b;
}
template <class T, class U>
inline auto max(T a, U b) -> decltype(a > b ? a : b) {
  return a > b ? a : b;
}
template <class T, class L, class H>
inline T constrain(T x, L lo, H hi) {
  return x < lo ? (T)lo : (x > hi ? (T)hi : x);
}
long map(long x, long in_min, long in_max, long out_min, long out_max);

void setup();
void loop();

// ---- core ----
void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t val);
int digitalRead(uint8_t pin);
int analogRead(uint8_t pin);
void analogWrite(uint8_t pin, int val);
void analogReadResolution(int bits);
void analogReference(uint8_t mode);
unsigned long millis();
unsigned long micros();
void delay(unsigned long ms);
void delayMicroseconds(unsigned int us);
unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout = 1000000L);
unsigned long pulseInLong(uint8_t pin, uint8_t state, unsigned long timeout = 1000000L);
void tone(uint8_t pin, unsigned int frequency, unsigned long duration = 0);
void noTone(uint8_t pin);
void shiftOut(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder, uint8_t val);
uint8_t shiftIn(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder);
void attachInterrupt(uint8_t interruptNum, void (*isr)(void), int mode);
void detachInterrupt(uint8_t interruptNum);
inline void interrupts() {}
inline void noInterrupts() {}
inline void yield() { delayMicroseconds(1); }
long random(long howbig);
long random(long howsmall, long howbig);
void randomSeed(unsigned long seed);
char *dtostrf(double val, signed char width, unsigned char prec, char *sout);
char *itoa(int value, char *str, int base);
char *ltoa(long value, char *str, int base);

// ---- ESP32 / ESP32-C3 extras (lab boards) ----
#define IRAM_ATTR
#define RTC_DATA_ATTR
#define RTC_NOINIT_ATTR
#ifndef BIT
#define BIT(n) (1ULL << (n))
#endif
typedef int esp_err_t;
#define ESP_OK 0
typedef enum {
  ESP_SLEEP_WAKEUP_UNDEFINED = 0,
  ESP_SLEEP_WAKEUP_ALL,
  ESP_SLEEP_WAKEUP_EXT0,
  ESP_SLEEP_WAKEUP_EXT1,
  ESP_SLEEP_WAKEUP_TIMER,
  ESP_SLEEP_WAKEUP_TOUCHPAD,
  ESP_SLEEP_WAKEUP_ULP,
  ESP_SLEEP_WAKEUP_GPIO,
  ESP_SLEEP_WAKEUP_UART,
} esp_sleep_wakeup_cause_t;
typedef enum { ESP_GPIO_WAKEUP_GPIO_LOW = 0, ESP_GPIO_WAKEUP_GPIO_HIGH = 1 } esp_deepsleep_gpio_wake_up_mode_t;
esp_err_t esp_sleep_enable_timer_wakeup(uint64_t time_in_us);
esp_err_t esp_deep_sleep_enable_gpio_wakeup(uint64_t gpio_pin_mask,
                                            esp_deepsleep_gpio_wake_up_mode_t mode);
esp_err_t esp_sleep_enable_gpio_wakeup();
esp_sleep_wakeup_cause_t esp_sleep_get_wakeup_cause();
/** Deep sleep: the board "restarts" at setup() on wake-up; RTC_DATA_ATTR values are kept. */
[[noreturn]] void esp_deep_sleep_start();
[[noreturn]] void esp_deep_sleep(uint64_t time_in_us);
esp_err_t esp_light_sleep_start();
inline uint32_t getCpuFrequencyMhz() { return 160; }

// Simulator hooks used by the bundled libraries (not part of the Arduino API).
namespace sim {
void advance(uint64_t us);
double value(const char *key, double fallback);
bool has(const char *key);
const char *text(const char *key, const char *fallback);  // a setting as typed (e.g. field1=FAN_ON)
bool trace();
bool tracePin(int pin);
void traceLine(const char *fmt, ...);
void registerLcd(void (*dump)());
}  // namespace sim

// ---- String ----
class String {
 public:
  String(const char *s = "") : s_(s ? s : "") {}
  String(const std::string &s) : s_(s) {}
  String(char c) : s_(1, c) {}
  String(unsigned char v, unsigned char base = DEC) { fromULong(v, base); }
  String(int v, unsigned char base = DEC) { fromLong(v, base); }
  String(unsigned int v, unsigned char base = DEC) { fromULong(v, base); }
  String(long v, unsigned char base = DEC) { fromLong(v, base); }
  String(unsigned long v, unsigned char base = DEC) { fromULong(v, base); }
  String(float v, unsigned char decimals = 2) { fromDouble(v, decimals); }
  String(double v, unsigned char decimals = 2) { fromDouble(v, decimals); }

  unsigned int length() const { return s_.size(); }
  const char *c_str() const { return s_.c_str(); }
  char charAt(unsigned int i) const { return i < s_.size() ? s_[i] : 0; }
  void setCharAt(unsigned int i, char c) {
    if (i < s_.size()) s_[i] = c;
  }
  char operator[](unsigned int i) const { return charAt(i); }
  char &operator[](unsigned int i) { return s_[i]; }
  bool concat(const String &o) {
    s_ += o.s_;
    return true;
  }
  String &operator+=(const String &o) {
    s_ += o.s_;
    return *this;
  }
  String &operator+=(const char *o) {
    s_ += o;
    return *this;
  }
  String &operator+=(char c) {
    s_ += c;
    return *this;
  }
  String &operator+=(int v) { return *this += String(v); }
  String &operator+=(long v) { return *this += String(v); }
  String &operator+=(unsigned int v) { return *this += String(v); }
  String &operator+=(unsigned long v) { return *this += String(v); }
  String &operator+=(float v) { return *this += String(v); }
  String &operator+=(double v) { return *this += String(v); }
  bool equals(const String &o) const { return s_ == o.s_; }
  bool equalsIgnoreCase(const String &o) const {
    if (s_.size() != o.s_.size()) return false;
    for (size_t i = 0; i < s_.size(); i++)
      if (tolower((unsigned char)s_[i]) != tolower((unsigned char)o.s_[i])) return false;
    return true;
  }
  bool operator==(const String &o) const { return s_ == o.s_; }
  bool operator==(const char *o) const { return s_ == (o ? o : ""); }
  bool operator!=(const String &o) const { return s_ != o.s_; }
  bool operator!=(const char *o) const { return !(*this == o); }
  bool operator<(const String &o) const { return s_ < o.s_; }
  bool operator>(const String &o) const { return s_ > o.s_; }
  int compareTo(const String &o) const { return s_.compare(o.s_); }
  bool startsWith(const String &p) const { return s_.rfind(p.s_, 0) == 0; }
  bool endsWith(const String &p) const {
    return s_.size() >= p.s_.size() && s_.compare(s_.size() - p.s_.size(), p.s_.size(), p.s_) == 0;
  }
  int indexOf(char c, unsigned int from = 0) const {
    size_t i = s_.find(c, from);
    return i == std::string::npos ? -1 : (int)i;
  }
  int indexOf(const String &t, unsigned int from = 0) const {
    size_t i = s_.find(t.s_, from);
    return i == std::string::npos ? -1 : (int)i;
  }
  int lastIndexOf(char c) const {
    size_t i = s_.rfind(c);
    return i == std::string::npos ? -1 : (int)i;
  }
  int lastIndexOf(const String &t) const {
    size_t i = s_.rfind(t.s_);
    return i == std::string::npos ? -1 : (int)i;
  }
  String substring(unsigned int from) const {
    return from >= s_.size() ? String("") : String(s_.substr(from));
  }
  String substring(unsigned int from, unsigned int to) const {
    if (from > to) {
      unsigned int t = from;
      from = to;
      to = t;
    }
    if (from >= s_.size()) return String("");
    return String(s_.substr(from, to - from));
  }
  void trim() {
    size_t a = s_.find_first_not_of(" \t\r\n");
    size_t b = s_.find_last_not_of(" \t\r\n");
    s_ = a == std::string::npos ? "" : s_.substr(a, b - a + 1);
  }
  void toUpperCase() {
    for (auto &c : s_) c = toupper((unsigned char)c);
  }
  void toLowerCase() {
    for (auto &c : s_) c = tolower((unsigned char)c);
  }
  void replace(const String &from, const String &to) {
    if (from.s_.empty()) return;
    size_t i = 0;
    while ((i = s_.find(from.s_, i)) != std::string::npos) {
      s_.replace(i, from.s_.size(), to.s_);
      i += to.s_.size();
    }
  }
  void replace(char from, char to) {
    for (auto &c : s_)
      if (c == from) c = to;
  }
  void remove(unsigned int index) {
    if (index < s_.size()) s_.erase(index);
  }
  void remove(unsigned int index, unsigned int count) {
    if (index < s_.size()) s_.erase(index, count);
  }
  void reserve(unsigned int n) { s_.reserve(n); }
  long toInt() const { return atol(s_.c_str()); }
  float toFloat() const { return (float)atof(s_.c_str()); }
  double toDouble() const { return atof(s_.c_str()); }
  void toCharArray(char *buf, unsigned int size) const {
    if (!size) return;
    strncpy(buf, s_.c_str(), size - 1);
    buf[size - 1] = 0;
  }
  void getBytes(unsigned char *buf, unsigned int size) const {
    toCharArray((char *)buf, size);
  }
  bool isEmpty() const { return s_.empty(); }
  const std::string &std() const { return s_; }

  friend String operator+(const String &a, const String &b) { return String(a.s_ + b.s_); }
  friend String operator+(const String &a, const char *b) { return String(a.s_ + (b ? b : "")); }
  friend String operator+(const char *a, const String &b) { return String((a ? a : "") + b.s_); }
  friend String operator+(const String &a, char b) { return String(a.s_ + b); }
  friend String operator+(const String &a, int b) { return a + String(b); }
  friend String operator+(const String &a, long b) { return a + String(b); }
  friend String operator+(const String &a, unsigned int b) { return a + String(b); }
  friend String operator+(const String &a, unsigned long b) { return a + String(b); }
  friend String operator+(const String &a, float b) { return a + String(b); }
  friend String operator+(const String &a, double b) { return a + String(b); }

 private:
  std::string s_;
  void fromLong(long v, unsigned char base) {
    if (base == DEC) {
      s_ = std::to_string(v);
      return;
    }
    fromULong((unsigned long)v, base);
  }
  void fromULong(unsigned long v, unsigned char base) {
    if (base < 2) base = 10;
    char buf[70];
    int i = 69;
    buf[i] = 0;
    do {
      int d = v % base;
      buf[--i] = d < 10 ? '0' + d : 'A' + d - 10;
      v /= base;
    } while (v);
    s_ = buf + i;
  }
  void fromDouble(double v, unsigned char decimals) {
    char buf[64];
    snprintf(buf, sizeof buf, "%.*f", decimals, v);
    s_ = buf;
  }
};

// ---- Print (Serial, LCDs) ----
class Print {
 public:
  virtual ~Print() {}
  virtual size_t write(uint8_t c) = 0;
  size_t write(const char *s) { return write((const uint8_t *)s, s ? strlen(s) : 0); }
  size_t write(const uint8_t *buf, size_t n) {
    for (size_t i = 0; i < n; i++) write(buf[i]);
    return n;
  }
  size_t write(const char *buf, size_t n) { return write((const uint8_t *)buf, n); }

  size_t print(const char *s) { return write(s); }
  size_t print(const String &s) { return write(s.c_str()); }
  size_t print(char c) { return write((uint8_t)c); }
  size_t print(unsigned char v, int base = DEC) { return printNumber(v, base); }
  size_t print(int v, int base = DEC) { return printSigned(v, base); }
  size_t print(unsigned int v, int base = DEC) { return printNumber(v, base); }
  size_t print(long v, int base = DEC) { return printSigned(v, base); }
  size_t print(unsigned long v, int base = DEC) { return printNumber(v, base); }
  size_t print(long long v, int base = DEC) { return printSigned((long)v, base); }
  size_t print(unsigned long long v, int base = DEC) { return printNumber((unsigned long)v, base); }
  size_t print(double v, int digits = 2) { return printFloat(v, digits); }
  size_t print(bool v) { return printNumber(v ? 1 : 0, DEC); }

  size_t println() { return write("\r\n"); }
  template <class T>
  size_t println(const T &v) {
    size_t n = print(v);
    return n + println();
  }
  template <class T>
  size_t println(const T &v, int fmt) {
    size_t n = print(v, fmt);
    return n + println();
  }
  size_t printf(const char *fmt, ...) __attribute__((format(printf, 2, 3)));

 private:
  size_t printSigned(long v, int base) {
    if (base == DEC && v < 0) return write('-') + printNumber((unsigned long)(-v), base);
    if (base != DEC) return printNumber((unsigned long)v, base);
    return printNumber((unsigned long)v, base);
  }
  size_t printNumber(unsigned long v, int base) { return write(String(v, (unsigned char)base).c_str()); }
  size_t printFloat(double v, int digits) {
    if (isnan(v)) return write("nan");
    if (isinf(v)) return write("inf");
    char buf[64];
    snprintf(buf, sizeof buf, "%.*f", digits < 0 ? 0 : digits, v);
    return write(buf);
  }
};

class Stream : public Print {
 public:
  virtual int available() = 0;
  virtual int read() = 0;
  virtual int peek() = 0;
  void setTimeout(unsigned long) {}
  long parseInt();
  float parseFloat();
  String readString();
  String readStringUntil(char terminator);
  size_t readBytes(char *buf, size_t n);
  size_t readBytesUntil(char term, char *buf, size_t n);
  bool find(const char *target);
};

extern "C" void __arc_set_baud(unsigned long baud);

class HardwareSerial : public Stream {
 public:
  explicit HardwareSerial(int id = 0) : id_(id) {}
  void begin(unsigned long baud, int = 0) {
    if (id_ == 0) __arc_set_baud(baud);
  }
  void end() {}
  size_t write(uint8_t c) override;
  using Print::write;
  int available() override;
  int read() override;
  int peek() override;
  void flush() {}
  operator bool() const { return true; }

 private:
  int id_;  // only Serial (0) is connected to the "Serial Monitor"
};

extern HardwareSerial Serial;
extern HardwareSerial Serial1;
extern HardwareSerial Serial2;
