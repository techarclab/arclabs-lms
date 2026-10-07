// PubSubClient (MQTT 3.1.1) on the virtual board. There is no real broker: connect() succeeds once
// Wi-Fi is up (test case: mqtt=down to refuse), publish/subscribe print "[mqtt] ..." lines, and a
// command can be sent to the sketch with  mqtt_in=arc/hyd/lab1/esp32c3-07/cmd/relay on
// (also later: "@20000 mqtt_in=<topic> <payload>"). It reaches the callback inside mqtt.loop().
#pragma once
#include <Arduino.h>
#include <WiFi.h>

#include <functional>
#include <string>
#include <vector>

#define MQTT_CONNECTION_TIMEOUT -4
#define MQTT_CONNECTION_LOST -3
#define MQTT_CONNECT_FAILED -2
#define MQTT_DISCONNECTED -1
#define MQTT_CONNECTED 0
#define MQTT_MAX_PACKET_SIZE 256
#define MQTT_KEEPALIVE 15

typedef std::function<void(char *, uint8_t *, unsigned int)> MQTT_CALLBACK_SIGNATURE;

class PubSubClient {
 public:
  PubSubClient() {}
  explicit PubSubClient(Client &) {}
  PubSubClient &setClient(Client &) { return *this; }
  PubSubClient &setServer(const char *host, uint16_t port) {
    host_ = host ? host : "";
    port_ = port;
    return *this;
  }
  PubSubClient &setServer(IPAddress ip, uint16_t port) { return setServer(ip.toString().c_str(), port); }
  PubSubClient &setCallback(MQTT_CALLBACK_SIGNATURE cb) {
    cb_ = cb;
    return *this;
  }
  bool setBufferSize(uint16_t) { return true; }
  PubSubClient &setKeepAlive(uint16_t) { return *this; }
  PubSubClient &setSocketTimeout(uint16_t) { return *this; }

  bool connect(const char *id) { return connect(id, nullptr, nullptr, nullptr, 0, false, nullptr, true); }
  bool connect(const char *id, const char *user, const char *pass) {
    return connect(id, user, pass, nullptr, 0, false, nullptr, true);
  }
  bool connect(const char *id, const char *willTopic, uint8_t willQos, bool willRetain, const char *willMessage) {
    return connect(id, nullptr, nullptr, willTopic, willQos, willRetain, willMessage, true);
  }
  bool connect(const char *id, const char *user, const char *pass, const char *willTopic, uint8_t willQos,
               bool willRetain, const char *willMessage, bool cleanSession = true) {
    (void)user;
    (void)pass;
    (void)cleanSession;
    sim::advance(50000);
    if (WiFi.status() != WL_CONNECTED || host_.empty() || (sim::has("mqtt") && sim::value("mqtt", 1) == 0)) {
      state_ = MQTT_CONNECT_FAILED;
      return false;
    }
    state_ = MQTT_CONNECTED;
    Serial.printf("[mqtt] connected to %s:%u as %s", host_.c_str(), port_, id ? id : "");
    if (willTopic) Serial.printf(" (will: %s = %s%s)", willTopic, willMessage ? willMessage : "", willRetain ? ", retained" : "");
    (void)willQos;
    Serial.print("\n");
    return true;
  }
  void disconnect() { state_ = MQTT_DISCONNECTED; }
  bool connected() { return state_ == MQTT_CONNECTED; }
  int state() { return state_; }

  bool publish(const char *topic, const char *payload) { return publish(topic, payload, false); }
  bool publish(const char *topic, const char *payload, bool retained) {
    return publish(topic, (const uint8_t *)payload, payload ? strlen(payload) : 0, retained);
  }
  bool publish(const char *topic, const uint8_t *payload, unsigned int len) { return publish(topic, payload, len, false); }
  bool publish(const char *topic, const uint8_t *payload, unsigned int len, bool retained) {
    if (!connected()) return false;
    sim::advance(2000);
    Serial.printf("[mqtt] publish %s%s: %.*s\n", topic ? topic : "", retained ? " (retained)" : "", (int)len,
                  payload ? (const char *)payload : "");
    return true;
  }
  bool publish_P(const char *topic, const char *payload, bool retained) { return publish(topic, payload, retained); }
  bool subscribe(const char *topic, uint8_t qos = 0) {
    if (!connected()) return false;
    subs_.push_back(topic ? topic : "");
    Serial.printf("[mqtt] subscribe %s (QoS %u)\n", topic ? topic : "", qos);
    return true;
  }
  bool unsubscribe(const char *topic) {
    for (size_t i = 0; i < subs_.size(); i++)
      if (subs_[i] == topic) subs_.erase(subs_.begin() + i--);
    return true;
  }
  bool loop() {
    sim::advance(1000);
    if (!connected()) return false;
    std::string in = sim::text("mqtt_in", "");
    if (in.empty() || in == last_in_) return true;
    last_in_ = in;
    size_t sp = in.find(' ');
    std::string t = in.substr(0, sp), p = sp == std::string::npos ? "" : in.substr(sp + 1);
    if (!cb_) return true;
    for (auto &f : subs_)
      if (matches(f, t)) {
        std::vector<char> tb(t.begin(), t.end());
        tb.push_back(0);
        cb_(tb.data(), (uint8_t *)p.data(), p.size());
        break;
      }
    return true;
  }

 private:
  static bool matches(const std::string &filter, const std::string &topic) {
    size_t f = 0, t = 0;
    while (f < filter.size()) {
      size_t fe = filter.find('/', f), te = topic.find('/', t);
      std::string fl = filter.substr(f, fe == std::string::npos ? std::string::npos : fe - f);
      if (fl == "#") return true;
      if (t > topic.size()) return false;
      std::string tl = topic.substr(t, te == std::string::npos ? std::string::npos : te - t);
      if (fl != "+" && fl != tl) return false;
      if (fe == std::string::npos) return te == std::string::npos;
      if (te == std::string::npos) return filter.substr(fe + 1) == "#";
      f = fe + 1;
      t = te + 1;
    }
    return t >= topic.size();
  }
  std::string host_;
  uint16_t port_ = 1883;
  int state_ = MQTT_DISCONNECTED;
  MQTT_CALLBACK_SIGNATURE cb_;
  std::vector<std::string> subs_;
  std::string last_in_;
};
