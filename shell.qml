import "app" as App

// Quickshell config root (`qs -p <repo root>`, via bin/pacman). The repo
// root is the shell root so `app/` can reach `lib/` and `assets/` as real
// sibling directories — no symlinks (spec 0001-publish-standalone). The
// actual window, game loop and input live in app/Main.qml; this file only
// instantiates it.
App.Main {}
