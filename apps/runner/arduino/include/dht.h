// "DHTlib" API (dht DHT; DHT.read11(pin); DHT.temperature) on the virtual board.
#pragma once
#include <Arduino.h>

#define DHTLIB_OK 0
#define DHTLIB_ERROR_CHECKSUM -1
#define DHTLIB_ERROR_TIMEOUT -2

class dht {
 public:
  double humidity = 0;
  double temperature = 0;
  int read11(uint8_t) { return read(11); }
  int read22(uint8_t) { return read(22); }
  int read21(uint8_t) { return read(22); }
  int read(uint8_t) { return read(11); }

 private:
  int read(int type) {
    sim::advance(5000);
    if (sim::has("dht")) return DHTLIB_ERROR_TIMEOUT;
    double t = sim::value("temp", 25), h = sim::value("humidity", 50);
    temperature = type == 11 ? floor(t) : round(t * 10) / 10;
    humidity = type == 11 ? round(h) : round(h * 10) / 10;
    return DHTLIB_OK;
  }
};
