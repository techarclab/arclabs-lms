// I2C bus stub: lets sketches that use I2C LCDs compile. No other I2C devices are simulated.
#pragma once
#include <Arduino.h>

class TwoWire : public Stream {
 public:
  void begin(int = -1, int = -1) {}
  void setClock(uint32_t) {}
  void beginTransmission(uint8_t) {}
  uint8_t endTransmission(bool = true) { return 0; }
  uint8_t requestFrom(uint8_t, uint8_t, bool = true) { return 0; }
  size_t write(uint8_t) override { return 1; }
  using Print::write;
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
};
inline TwoWire Wire;
