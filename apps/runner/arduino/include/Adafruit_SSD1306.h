// SSD1306 OLED (Adafruit library) on the virtual board. Drawing goes into a buffer; display()
// copies it to the screen, as on the real panel. When the run ends, the last screen sent with
// display() is printed as text under "--- OLED ---" so test cases can check it.
// Test-case setting: oled=missing makes begin() return false (display not found at its address).
#pragma once
#include <Adafruit_GFX.h>
#include <Wire.h>

#define SSD1306_SWITCHCAPVCC 0x02
#define SSD1306_EXTERNALVCC 0x01
#define SSD1306_BLACK 0
#define SSD1306_WHITE 1
#define SSD1306_INVERSE 2

class Adafruit_SSD1306 : public Adafruit_GFX {
 public:
  Adafruit_SSD1306(uint8_t w, uint8_t h, TwoWire * = &Wire, int8_t = -1, uint32_t = 400000UL,
                   uint32_t = 100000UL)
      : Adafruit_GFX(w, h) {
    blank();
  }
  Adafruit_SSD1306(uint8_t w, uint8_t h, int8_t, int8_t, int8_t, int8_t, int8_t) : Adafruit_GFX(w, h) {
    blank();
  }

  bool begin(uint8_t = SSD1306_SWITCHCAPVCC, uint8_t = 0, bool = true, bool = true) {
    if (strcmp(sim::text("oled", ""), "missing") == 0) return false;
    if (!added_) {
      added_ = true;
      list().push_back(this);
      sim::registerLcd(&Adafruit_SSD1306::dumpAll);
    }
    begun_ = true;
    sim::advance(100000);  // panel init
    return true;
  }
  void clearDisplay() {
    clearCells();
    x_ = y_ = 0;
  }
  void display() {
    if (!begun_) return;
    memcpy(shown_, cell_, sizeof shown_);
    sim::advance(25000);  // 1 KB over I2C at 400 kHz
  }
  void invertDisplay(bool) {}
  void dim(bool) {}
  void ssd1306_command(uint8_t) {}
  void startscrollright(uint8_t, uint8_t) {}
  void startscrollleft(uint8_t, uint8_t) {}
  void startscrolldiagright(uint8_t, uint8_t) {}
  void startscrolldiagleft(uint8_t, uint8_t) {}
  void stopscroll() {}
  uint8_t *getBuffer() { return nullptr; }
  bool getPixel(int16_t, int16_t) { return false; }

 private:
  char shown_[ROWS][COLS];
  bool added_ = false, begun_ = false;

  void blank() { memset(shown_, ' ', sizeof shown_); }
  static std::vector<Adafruit_SSD1306 *> &list() {
    static std::vector<Adafruit_SSD1306 *> l;
    return l;
  }
  static void dumpAll() {
    for (auto *d : list()) {
      int cols = d->w_ / 6, rows = d->h_ / 8;
      if (cols > COLS) cols = COLS;
      if (rows > ROWS) rows = ROWS;
      int last = -1;
      for (int r = 0; r < rows; r++)
        for (int c = 0; c < cols; c++)
          if (d->shown_[r][c] != ' ' && d->shown_[r][c] != SKIP) last = r;
      ::printf("\n--- OLED ---\n");
      for (int r = 0; r <= last; r++) {
        char line[COLS + 1];
        int n = 0;
        for (int c = 0; c < cols; c++)
          if (d->shown_[r][c] != SKIP) line[n++] = d->shown_[r][c];
        while (n > 0 && line[n - 1] == ' ') n--;
        ::printf("%.*s\n", n, line);
      }
    }
  }
};
