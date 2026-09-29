#pragma once
#include <Arduino.h>
class SPIClass {
 public:
  void begin() {}
  void end() {}
  uint8_t transfer(uint8_t) { return 0; }
};
inline SPIClass SPI;
