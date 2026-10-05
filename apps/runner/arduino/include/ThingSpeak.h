// ThingSpeak library on the virtual board. No network: field values come from the test case,
// e.g. field1=FAN_ON (change it later with "@20000 field1=LIGHT_ON"). Reads fail (empty / 0,
// status -301) while Wi-Fi is not connected. Writes "succeed" (200) and print nothing.
#pragma once
#include <Arduino.h>
#include <WiFi.h>

#define TS_OK_SUCCESS 200
#define TS_ERR_BADAPIKEY 400
#define TS_ERR_NOT_INSERTED -401
#define TS_ERR_TIMEOUT -304
#define TS_ERR_FAILED_TO_CONNECT -301

class ThingSpeakClass {
 public:
  bool begin(Client &) { return true; }

  String readStringField(unsigned long channel, unsigned int field, const char * = nullptr) {
    (void)channel;
    if (!online()) return String("");
    char key[16];
    snprintf(key, sizeof key, "field%u", field);
    status_ = TS_OK_SUCCESS;
    return String(sim::text(key, ""));
  }
  float readFloatField(unsigned long ch, unsigned int field, const char *key = nullptr) {
    return (float)atof(readStringField(ch, field, key).c_str());
  }
  long readLongField(unsigned long ch, unsigned int field, const char *key = nullptr) {
    return atol(readStringField(ch, field, key).c_str());
  }
  int readIntField(unsigned long ch, unsigned int field, const char *key = nullptr) {
    return (int)readLongField(ch, field, key);
  }
  int readMultipleFields(unsigned long, const char * = nullptr) { return online() ? TS_OK_SUCCESS : status_; }
  int getLastReadStatus() { return status_; }

  int setField(unsigned int, int) { return TS_OK_SUCCESS; }
  int setField(unsigned int, long) { return TS_OK_SUCCESS; }
  int setField(unsigned int, float) { return TS_OK_SUCCESS; }
  int setField(unsigned int, double) { return TS_OK_SUCCESS; }
  int setField(unsigned int, const char *) { return TS_OK_SUCCESS; }
  int setField(unsigned int, const String &) { return TS_OK_SUCCESS; }
  int setStatus(const String &) { return TS_OK_SUCCESS; }
  template <class T>
  int writeField(unsigned long, unsigned int, T, const char * = nullptr) {
    return online() ? TS_OK_SUCCESS : TS_ERR_FAILED_TO_CONNECT;
  }
  int writeFields(unsigned long, const char * = nullptr) {
    return online() ? TS_OK_SUCCESS : TS_ERR_FAILED_TO_CONNECT;
  }

 private:
  bool online() {
    sim::advance(300000);  // an HTTP request takes ~300 ms
    if (WiFi.status() != WL_CONNECTED) {
      status_ = TS_ERR_FAILED_TO_CONNECT;
      return false;
    }
    return true;
  }
  int status_ = TS_OK_SUCCESS;
};

inline ThingSpeakClass ThingSpeak;
