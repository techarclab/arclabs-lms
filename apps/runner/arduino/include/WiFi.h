// ESP32 WiFi on the virtual board. There is no real network: WiFi.begin() "connects" after
// about 1 s of simulated time (test case: wifi_ms=2000 to change it, wifi=off to never connect).
#pragma once
#include <Arduino.h>

typedef enum {
  WL_IDLE_STATUS = 0,
  WL_NO_SSID_AVAIL = 1,
  WL_SCAN_COMPLETED = 2,
  WL_CONNECTED = 3,
  WL_CONNECT_FAILED = 4,
  WL_CONNECTION_LOST = 5,
  WL_DISCONNECTED = 6,
  WL_NO_SHIELD = 255,
} wl_status_t;

typedef enum { WIFI_OFF = 0, WIFI_STA = 1, WIFI_AP = 2, WIFI_AP_STA = 3 } wifi_mode_t;
#define WIFI_MODE_STA WIFI_STA
#define WIFI_MODE_AP WIFI_AP

class IPAddress {
 public:
  IPAddress(uint8_t a = 0, uint8_t b = 0, uint8_t c = 0, uint8_t d = 0) : b_{a, b, c, d} {}
  uint8_t operator[](int i) const { return b_[i & 3]; }
  String toString() const {
    char buf[16];
    snprintf(buf, sizeof buf, "%u.%u.%u.%u", b_[0], b_[1], b_[2], b_[3]);
    return String(buf);
  }
  operator String() const { return toString(); }
  bool operator==(const IPAddress &o) const { return memcmp(b_, o.b_, 4) == 0; }

 private:
  uint8_t b_[4];
};

class WiFiClass {
 public:
  wl_status_t begin(const char *ssid, const char *pass = nullptr, int = 0, const uint8_t * = nullptr,
                    bool = true) {
    begun_ = ssid && *ssid;
    (void)pass;
    started_ = millis();
    return status();
  }
  wl_status_t begin(const String &ssid, const String &pass = "") { return begin(ssid.c_str(), pass.c_str()); }
  wl_status_t status() {
    if (!begun_) return WL_IDLE_STATUS;
    if (sim::has("wifi") && sim::value("wifi", 1) == 0) return WL_DISCONNECTED;
    sim::advance(1000);  // asking the radio takes a moment
    return millis() - started_ >= (unsigned long)sim::value("wifi_ms", 1000) ? WL_CONNECTED : WL_DISCONNECTED;
  }
  bool isConnected() { return status() == WL_CONNECTED; }
  bool mode(wifi_mode_t m) { mode_ = m; return true; }
  wifi_mode_t getMode() const { return mode_; }
  bool disconnect(bool = false, bool = false) { begun_ = false; return true; }
  bool reconnect() { started_ = millis(); return begun_; }
  bool setAutoReconnect(bool) { return true; }
  bool setSleep(bool) { return true; }
  void setHostname(const char *) {}
  IPAddress localIP() { return isConnected() ? IPAddress(192, 168, 1, 50) : IPAddress(); }
  IPAddress gatewayIP() { return isConnected() ? IPAddress(192, 168, 1, 1) : IPAddress(); }
  IPAddress subnetMask() { return IPAddress(255, 255, 255, 0); }
  long RSSI() { return isConnected() ? -58 : 0; }
  String SSID() { return begun_ ? String("lab-wifi") : String(""); }
  String macAddress() { return String("24:58:7C:AB:CD:EF"); }

 private:
  bool begun_ = false;
  unsigned long started_ = 0;
  wifi_mode_t mode_ = WIFI_STA;
};

inline WiFiClass WiFi;

// A TCP client. The virtual board has no network, so it never actually connects; libraries such
// as ThingSpeak only need the object.
class Client : public Stream {};

class WiFiClient : public Client {
 public:
  int connect(const char *, uint16_t) { return 0; }
  int connect(IPAddress, uint16_t) { return 0; }
  uint8_t connected() { return 0; }
  void stop() {}
  size_t write(uint8_t) override { return 1; }
  using Print::write;
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  operator bool() { return false; }
};

class WiFiClientSecure : public WiFiClient {
 public:
  void setInsecure() {}
  void setCACert(const char *) {}
  void setCertificate(const char *) {}
  void setPrivateKey(const char *) {}
};
