// Adafruit GFX on the virtual board: text is kept as characters on a 6x8-pixel cell grid (the
// built-in font), and shapes are accepted but not drawn. Used by Adafruit_SSD1306.h.
#pragma once
#include <Arduino.h>

#ifndef BLACK
#define BLACK 0
#endif
#ifndef WHITE
#define WHITE 1
#endif
#ifndef INVERSE
#define INVERSE 2
#endif

class Adafruit_GFX : public Print {
 public:
  Adafruit_GFX(int16_t w, int16_t h) : w_(w), h_(h) { clearCells(); }

  size_t write(uint8_t c) override {
    if (c == '\r') return 1;
    if (c == '\n') {
      x_ = 0;
      y_ += 8 * size_;
      return 1;
    }
    if (wrap_ && x_ + 6 * size_ > w_) {
      x_ = 0;
      y_ += 8 * size_;
    }
    int col = x_ / 6, row = y_ / 8;
    if (x_ >= 0 && y_ >= 0 && col < COLS && row < ROWS) {
      cell_[row][col] = color_ == BLACK ? ' ' : (char)c;
      for (int k = 1; k < size_ && col + k < COLS; k++) cell_[row][col + k] = SKIP;  // wide text
    }
    x_ += 6 * size_;
    return 1;
  }
  using Print::write;

  void setCursor(int16_t x, int16_t y) {
    x_ = x;
    y_ = y;
  }
  int16_t getCursorX() const { return x_; }
  int16_t getCursorY() const { return y_; }
  void setTextSize(uint8_t s) { size_ = s < 1 ? 1 : (s > 8 ? 8 : s); }
  void setTextSize(uint8_t sx, uint8_t) { setTextSize(sx); }
  void setTextColor(uint16_t c) { color_ = c; }
  void setTextColor(uint16_t c, uint16_t) { color_ = c; }
  void setTextWrap(bool w) { wrap_ = w; }
  void cp437(bool = true) {}
  void setRotation(uint8_t) {}
  uint8_t getRotation() const { return 0; }
  int16_t width() const { return w_; }
  int16_t height() const { return h_; }
  void getTextBounds(const char *s, int16_t x, int16_t y, int16_t *x1, int16_t *y1, uint16_t *w, uint16_t *h) {
    *x1 = x;
    *y1 = y;
    *w = (uint16_t)(strlen(s) * 6 * size_);
    *h = (uint16_t)(8 * size_);
  }
  void getTextBounds(const String &s, int16_t x, int16_t y, int16_t *x1, int16_t *y1, uint16_t *w, uint16_t *h) {
    getTextBounds(s.c_str(), x, y, x1, y1, w, h);
  }

  // Shapes and bitmaps: accepted so sketches compile; not shown in the text output.
  void drawPixel(int16_t, int16_t, uint16_t) {}
  void drawLine(int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void drawFastHLine(int16_t, int16_t, int16_t, uint16_t) {}
  void drawFastVLine(int16_t, int16_t, int16_t, uint16_t) {}
  void drawRect(int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void fillRect(int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void drawRoundRect(int16_t, int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void fillRoundRect(int16_t, int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void drawCircle(int16_t, int16_t, int16_t, uint16_t) {}
  void fillCircle(int16_t, int16_t, int16_t, uint16_t) {}
  void drawTriangle(int16_t, int16_t, int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void fillTriangle(int16_t, int16_t, int16_t, int16_t, int16_t, int16_t, uint16_t) {}
  void drawBitmap(int16_t, int16_t, const uint8_t *, int16_t, int16_t, uint16_t) {}
  void drawBitmap(int16_t, int16_t, const uint8_t *, int16_t, int16_t, uint16_t, uint16_t) {}
  void fillScreen(uint16_t c) {
    clearCells();
    (void)c;
  }

 protected:
  static constexpr int COLS = 42, ROWS = 16;  // enough for 256x128
  static constexpr char SKIP = '\x01';
  char cell_[ROWS][COLS];
  int16_t w_, h_, x_ = 0, y_ = 0;
  uint8_t size_ = 1;
  uint16_t color_ = WHITE;
  bool wrap_ = true;

  void clearCells() {
    for (auto &r : cell_) memset(r, ' ', sizeof r);
  }
};
