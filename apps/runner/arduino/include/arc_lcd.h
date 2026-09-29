// Shared text-LCD model for LiquidCrystal and LiquidCrystal_I2C. The final screen is printed when
// the simulation ends, so tests can check what the LCD shows.
#pragma once
#include <Arduino.h>

class ArcLcd : public Print {
 public:
  ArcLcd(uint8_t cols = 16, uint8_t rows = 2) { setSize(cols, rows); }
  void setSize(uint8_t cols, uint8_t rows) {
    cols_ = constrain(cols, 1, 40);
    rows_ = constrain(rows, 1, 4);
    wipe();
    add(this);
  }
  void clear() {
    wipe();
    sim::advance(2000);
  }
  void home() { col_ = row_ = 0; }
  void setCursor(uint8_t col, uint8_t row) {
    col_ = col;
    row_ = row < rows_ ? row : rows_ - 1;
  }
  size_t write(uint8_t c) override {
    if (c == '\r' || c == '\n') return 1;
    if (col_ < cols_ && row_ < rows_) buf_[row_][col_] = (char)c;
    col_++;
    sim::advance(40);
    return 1;
  }
  using Print::write;
  void display() {}
  void noDisplay() {}
  void cursor() {}
  void noCursor() {}
  void blink() {}
  void noBlink() {}
  void backlight() {}
  void noBacklight() {}
  void scrollDisplayLeft() {}
  void scrollDisplayRight() {}
  void leftToRight() {}
  void rightToLeft() {}
  void autoscroll() {}
  void noAutoscroll() {}
  void createChar(uint8_t, uint8_t *) {}
  void createChar(uint8_t, const char *) {}

 private:
  uint8_t cols_ = 16, rows_ = 2, col_ = 0, row_ = 0;
  char buf_[4][40];

  void wipe() {
    for (auto &r : buf_) memset(r, ' ', sizeof r);
    col_ = row_ = 0;
  }
  static ArcLcd **list() {
    static ArcLcd *l[4] = {nullptr, nullptr, nullptr, nullptr};
    return l;
  }
  static void add(ArcLcd *lcd) {
    ArcLcd **l = list();
    for (int i = 0; i < 4; i++) {
      if (l[i] == lcd) return;
      if (!l[i]) {
        l[i] = lcd;
        sim::registerLcd(&ArcLcd::dumpAll);
        return;
      }
    }
  }
  static void dumpAll() {
    ArcLcd **l = list();
    for (int i = 0; i < 4 && l[i]; i++) {
      ArcLcd *d = l[i];
      ::printf("\n--- LCD ---\n");
      for (int r = 0; r < d->rows_; r++) {
        int end = d->cols_;
        while (end > 0 && d->buf_[r][end - 1] == ' ') end--;
        ::printf("%.*s\n", end, d->buf_[r]);
      }
    }
  }
};
