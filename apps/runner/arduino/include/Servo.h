// Servo library on the virtual board — moves are shown when the test uses trace=pins.
#pragma once
#include <Arduino.h>

class Servo {
 public:
  uint8_t attach(int pin, int = 544, int = 2400) {
    pin_ = pin;
    return 1;
  }
  void detach() { pin_ = -1; }
  void write(int angle) {
    if (angle > 180) angle = map(angle, 544, 2400, 0, 180);  // microseconds form
    angle = constrain(angle, 0, 180);
    sim::advance(20);
    if (angle != angle_ && sim::tracePin(pin_)) sim::traceLine("Servo D%d -> %d deg", pin_, angle);
    angle_ = angle;
  }
  void writeMicroseconds(int us) { write(map(constrain(us, 544, 2400), 544, 2400, 0, 180)); }
  int read() { return angle_ < 0 ? 90 : angle_; }
  bool attached() { return pin_ >= 0; }

 private:
  int pin_ = -1;
  int angle_ = -1;
};
