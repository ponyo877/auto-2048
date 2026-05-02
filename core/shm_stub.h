#pragma once
/*
 * shm_stub.h — WASM-safe stand-in for moporgic/shm.h.
 *
 * Although moporgic/shm.h already self-disables when __linux__ is undefined,
 * we replace it under -DTDL2048_AS_LIBRARY -D__EMSCRIPTEN__ as a belt-and-
 * suspenders measure. This header preserves the full public surface that
 * 2048.cpp consumes (support / enable / auto_cleanup / allocator) so that
 * template instantiations still resolve.
 */
#include <cstddef>
#include <stdexcept>
#include <memory>

namespace moporgic {
class shm {
public:
    static constexpr bool support() { return false; }

    template<typename type = void>
    static type* alloc(size_t /*size*/) { throw std::bad_alloc(); }

    template<typename type = void>
    static void free(type* /*shm*/) { throw std::bad_alloc(); }

    template<typename type = void>
    static bool enable() { return false; }

    template<typename type = void>
    static void enable(bool use) {
        if (use) throw std::invalid_argument("shm is not supported (wasm stub)");
    }

    static bool auto_cleanup() { return false; }
    static void auto_cleanup(bool use) {
        if (use) throw std::invalid_argument("shm is not supported (wasm stub)");
    }

protected:
    static void clear() {}

public:
    template<typename type>
    class allocator : public std::allocator<type> {
    public:
        inline type* allocate(std::size_t /*n*/) { throw std::bad_alloc(); }
        inline void deallocate(type* /*p*/, std::size_t /*n*/) {}
    };
};
} // namespace moporgic
