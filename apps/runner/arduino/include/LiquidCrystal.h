#pragma once
#include <arc_lcd.h>

class LiquidCrystal : public ArcLcd {
 public:
  LiquidCrystal(uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t) {}
  LiquidCrystal(uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t) {}
  LiquidCrystal(uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t) {}
  LiquidCrystal(uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t) {}
  void begin(uint8_t cols, uint8_t rows, uint8_t = 0) { setSize(cols, rows); }
};
