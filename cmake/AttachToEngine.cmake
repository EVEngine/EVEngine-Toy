# CMAKE_PROJECT_INCLUDE: attach an external, statically linked native plugin.
# Restrict to EVEngine's root project; dependencies may invoke project() too.
if(NOT EXISTS "${CMAKE_SOURCE_DIR}/cmake/EVEnginePlugin.cmake" OR
   NOT PROJECT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR)
    return()
endif()
include_guard(GLOBAL)
set(EVE_TOY_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." CACHE INTERNAL "External Toy plugin sources")
option(EVE_TOY_ENABLE_THREADS "Require SharedArrayBuffer and a pthread worker pool" OFF)
set(EVE_TOY_LINK_OPT_LEVEL "1" CACHE STRING "WASM post-link optimization level")
if(NOT EVE_TOY_LINK_OPT_LEVEL MATCHES "^[0123sz]$")
    message(FATAL_ERROR "EVE_TOY_LINK_OPT_LEVEL must be 0, 1, 2, 3, s or z")
endif()
function(eve_toy_attach)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
        message(FATAL_ERROR "AttachToEngine.cmake is for Emscripten; desktop uses find_package(EVEngine)")
    endif()
    if(NOT TARGET eve)
        message(FATAL_ERROR "EVEngine browser host target eve was not generated")
    endif()
    # This is a plugin registration TU in the host, not a built-in engine module.
    # ModuleRegister follows the existing native-plugin ABI; no boot-list edits.
    if(EVE_TOY_ENABLE_THREADS)
        set(EVE_TOY_REQUIRES_THREADS_JS true)
    else()
        # The host uses the main-thread frame loop and ASYNCIFY. Link against
        # Emscripten single-thread syslibs; no SharedArrayBuffer or COOP/COEP.
        # Opt back into threads explicitly for games that require workers.
        set(EVE_TOY_REQUIRES_THREADS_JS false)
        get_target_property(_toy_link_options eve LINK_OPTIONS)
        list(FILTER _toy_link_options EXCLUDE REGEX "^-s(USE_PTHREADS|PTHREAD_POOL_SIZE)=")
        set_property(TARGET eve PROPERTY LINK_OPTIONS "${_toy_link_options}")
        target_link_options(eve PRIVATE -sUSE_PTHREADS=0)
    endif()
    configure_file("${EVE_TOY_ROOT}/web/shell.html" "${CMAKE_BINARY_DIR}/eve-toy-shell.html" @ONLY)
    target_link_options(eve PRIVATE "-O${EVE_TOY_LINK_OPT_LEVEL}")
    target_sources(eve PRIVATE "${EVE_TOY_ROOT}/src/ToyPlugin.cpp")
    target_compile_definitions(eve PRIVATE EVE_TOY_STATIC_PLUGIN=1)
    target_link_options(eve PRIVATE
        "SHELL:--pre-js \"${EVE_TOY_ROOT}/web/bridge.js\""
        "SHELL:--shell-file \"${CMAKE_BINARY_DIR}/eve-toy-shell.html\"")
    target_link_options(eve PRIVATE -sEXPORTED_RUNTIME_METHODS=FS,lengthBytesUTF8,stringToUTF8,UTF8ToString,HEAPU8)
    set_property(TARGET eve APPEND PROPERTY LINK_DEPENDS
        "${EVE_TOY_ROOT}/web/bridge.js" "${EVE_TOY_ROOT}/web/shell.html")
endfunction()
cmake_language(DEFER DIRECTORY "${CMAKE_SOURCE_DIR}" CALL eve_toy_attach)
