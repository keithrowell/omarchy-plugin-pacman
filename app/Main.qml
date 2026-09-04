import QtQuick
import Quickshell

// Entry point: `qs -p app/Main.qml` (via bin/pacman). One floating window in
// the theme's colours. Game rendering arrives in later specs; this is the shell.
ShellRoot {
    FloatingWindow {
        id: window
        title: "Pacman"
        // 28x31 tiles of 8 px at 3x.
        implicitWidth: 672
        implicitHeight: 864
        color: Theme.background

        FocusScope {
            id: stage
            anchors.fill: parent
            focus: true

            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape || event.key === Qt.Key_Q) {
                    event.accepted = true;
                    Qt.quit();
                }
            }

            Component.onCompleted: forceActiveFocus()

            Column {
                anchors.centerIn: parent
                spacing: 24

                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: "PACMAN"
                    color: Theme.accent
                    font.family: Theme.fontFamily
                    font.pixelSize: 48
                }

                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: "press q to quit"
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: 12
                }
            }
        }
    }
}
