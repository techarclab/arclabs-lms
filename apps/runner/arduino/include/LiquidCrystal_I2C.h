#pragma once
#include <arc_lcd.h>

class LiquidCrystal_I2C : public ArcLcd {
 public:
  LiquidCrystal_I2C(uint8_t, uint8_t cols = 16, uint8_t rows = 2) : c_(cols), r_(rows) {}
  void init() { setSize(c_, r_); }
  void begin() { setSize(c_, r_); }
  void begin(uint8_t cols, uint8_t rows, uint8_t = 0) { setSize(cols, rows); }
  void setBacklight(uint8_t) {}

 private:
  uint8_t c_, r_;
};
