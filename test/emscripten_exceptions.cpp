#include <cstdio>
#include <stdexcept>
static void recoverable() { throw std::runtime_error("metadata budget"); }
int         main() {
    try {
        recoverable();
    } catch (const std::exception& e) {
        std::puts(e.what());
        return 0;
    }
    return 3;
}
