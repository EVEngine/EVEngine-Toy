# CMAKE_PROJECT_INCLUDE: attach an external, statically linked native plugin.
# Restrict to EVEngine's root project; dependencies may invoke project() too.
if(NOT EXISTS "${CMAKE_SOURCE_DIR}/cmake/EVEnginePlugin.cmake" OR
   NOT PROJECT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR)
    return()
endif()
include_guard(GLOBAL)
set(EVE_TOY_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." CACHE INTERNAL "External Toy plugin sources")
function(eve_toy_attach)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
        message(FATAL_ERROR "AttachToEngine.cmake is for Emscripten; desktop uses find_package(EVEngine)")
    endif()
    if(NOT TARGET eve)
        message(FATAL_ERROR "EVEngine browser host target eve was not generated")
    endif()
    # This is a plugin registration TU in the host, not a built-in engine module.
    # ModuleRegister follows the existing native-plugin ABI; no boot-list edits.
    target_sources(eve PRIVATE "${EVE_TOY_ROOT}/src/ToyPlugin.cpp")
    target_compile_definitions(eve PRIVATE EVE_TOY_STATIC_PLUGIN=1)
    target_link_options(eve PRIVATE
        "SHELL:--pre-js \"${EVE_TOY_ROOT}/web/bridge.js\""
        "SHELL:--shell-file \"${EVE_TOY_ROOT}/web/shell.html\"")
    set_property(TARGET eve APPEND PROPERTY LINK_DEPENDS
        "${EVE_TOY_ROOT}/web/bridge.js" "${EVE_TOY_ROOT}/web/shell.html")
endfunction()
cmake_language(DEFER DIRECTORY "${CMAKE_SOURCE_DIR}" CALL eve_toy_attach)
