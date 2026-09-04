import QtQuick
import Quickshell

ShellRoot {
  FloatingWindow {
    id: win
    visible: true; title: "pixel-spike"
    implicitWidth: 224*3; implicitHeight: 248*3
    color: "#1c1f26"
    // Low-res scene: smooth vector drawing at native arcade resolution
    Item { id: stage; width: 672; height: 744
    Item {
      id: scene
      width: 224; height: 248
      scale: 3; transformOrigin: Item.TopLeft
      layer.enabled: true
      layer.textureSize: Qt.size(224, 248)
      layer.smooth: false          // nearest-neighbour upscale => big pixels
      Rectangle { anchors.fill: parent; color: "#1c1f26" }
      Canvas {
        anchors.fill: parent
        onPaint: {
          var c = getContext("2d")
          c.fillStyle = "#ebcb8b"; c.beginPath(); c.arc(60, 60, 20, 0.35, 5.93); c.lineTo(60,60); c.fill()   // pacman wedge
          c.fillStyle = "#bf616a"; c.beginPath(); c.arc(140, 60, 20, Math.PI, 0); c.lineTo(160, 80); c.lineTo(120, 80); c.fill() // ghost dome
          c.strokeStyle = "#81a1c1"; c.lineWidth = 2; c.beginPath(); c.rect(20, 120, 184, 60); c.stroke()
          c.fillStyle = "#d5d0c0"; for (var i=0;i<8;i++) c.fillRect(30+i*22, 148, 2, 2)
          c.font = "8px monospace"; c.fillText("HIGH SCORE", 70, 20)
        }
      }
    }
    }
    Timer { interval: 700; running: true; onTriggered: { stage.grabToImage(function(r){ r.saveToFile(Quickshell.env("PWD")+"/pixels.png"); console.log("saved"); Qt.quit() }) } }
  }
}
