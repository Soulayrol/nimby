const { app, BrowserWindow, Tray, screen, ipcMain } = require("electron");
const { autoUpdater } = require('electron-updater');
const path = require("path");
const find = require('find-process');
const axios = require('axios');

var CONFIG = require('./config.json');

const isDev = require('electron-is-dev'); 
const iconDirPath = path.join(path.dirname(__dirname), 'resources', 'images')

// Window default value
let mainWindow;
let tray = null

const panelSize = {
  width: 356,
  height: 500,
  visible: false
}

// Update check 15 min 
setInterval(() => {
  autoUpdater.checkForUpdates()
}, 60000 * 15);

autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
  autoUpdater.quitAndInstall();
});
autoUpdater.on('error', (error) => {
  console.log(error)
});

// Nimby
var tsid = undefined;
var hnm = undefined;
var nimbyOn = false;

setInterval(() => {
  checkForProcess()
}, 60000);

axios.get('http://tractor/Tractor/monitor?q=login&user=root')
  .then(function (response) {
    tsid = response.data.tsid;
    console.log(tsid);
  })
  .catch(function (error) {
    // console.log(error);
    console.log("-------------------- ERROR ----------------------------");
  })

axios.get(`http://localhost:9005/blade/status`)
  .then(function (response) {
    console.log(response.data);
    hnm = response.data.hnm;
  })
  .catch(function (error) {
    // console.log(error);
    console.log("-------------------- ERROR ----------------------------");
  })

if (isDev){
  setInterval(() => {
    axios.get(`http://localhost:9005/blade/ctrl?nimby=0`)
      .then(function (response) {
        console.log(response.data);
      })
      .catch(function (error) {
        // console.log(error);
        console.log("-------------------- ERROR ----------------------------");
      })
  }, 1000 * 10);
}

async function checkForProcess() {
  console.log("Check for Processes ...");
  let processFound = false;
  find("name", "", false).then(list => {
    for(var i = 0; i < list.length; i++) {
      if (CONFIG.softwares.includes(path.parse(list[i].name).name)){
        console.log(`Ho, you running ${path.parse(list[i].name).name}. We going to turn nimby ON`);
        processFound = true;
        break;
      }
    }
  })
  if(!nimbyOn && processFound) {
    // Set Nimby on
    axios.get(`http://localhost:9005/blade/ctrl?nimby=1`)
      .then(function (response) {
        console.log("Nimby set ON");
        nimbyOn = true;
        // Eject running job
        if(hnm && tsid) {
          axios.get(`http://tractor/Tractor/queue?q=ejectall&blade=${hnm}&tsid=${tsid}`)
            .then(function (response) {
              console.log("Current jobs ejected");
            }
          )
        }
      })
      .catch(function (error) {
        console.log("-------------------- ERROR ----------------------------");
        console.log("Error setting nimby ON");
      }
    )
  }
  if (tray != null) {
    _img = nimbyOn ? path.join(iconDirPath, "artfx_green.png") : path.join(iconDirPath, "artfx_red.png")
    tray.setImage(_img)
  }
}

// Window

function createPanel(toggleOnLoad = false) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: panelSize.width,
    height: panelSize.height,
    x: width - panelSize.width - 10,
    y: height - panelSize.height - 10,
    backgroundColor: "#222222",
    frame: false,
    show: false,
    opacity: 0,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    type: "toolbar",
    maximizable: false,
    minimizable: false,
    webPreferences: { nodeIntegration: true }
  });
  // loadURL
  mainWindow.loadFile(
    // "http://localhost:3000/"
    isDev ? 'index.html' : `file://${path.join(__dirname, "../build/index.html")}`
  );
  mainWindow.on("closed", () => (mainWindow = null));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (toggleOnLoad) setTimeout(() => { toggleTray(false) }, 33);
  })

  mainWindow.on("blur", () => {
    // Only run when not in an overlay
    mainWindow.webContents.send("panelBlur")
    showPanel(false)
  })

  mainWindow.on('move', (e) => {
    e.preventDefault()
  })

  mainWindow.on('resize', (e) => {
    e.preventDefault()
  })
}

function createTray() {
  if (tray != null) return false;
  tray = new Tray(path.join(iconDirPath, "artfx.ico"))
  tray.setToolTip("Nimby" + (isDev ? "(Dev)" : ""))
  tray.on("click", () => toggleTray())
  tray.on("right-click", () => toggleTray())
}

const toggleTray = async () => {
  if (mainWindow == null) {
    createPanel(true)
    return false
  }
  if (mainWindow) {
    showPanel(true, panelSize.height)
    mainWindow.focus()
    mainWindow.webContents.send("tray-clicked")
    mainWindow.setSkipTaskbar(false)
    mainWindow.setSkipTaskbar(true)
  }
}

function showPanel(show = true) {
  if(show) {
    mainWindow.setOpacity(1)
    panelSize.visible = true
  } else {
    mainWindow.setOpacity(0)
    panelSize.visible = false
  }
}

app.on("ready", () => {
  autoUpdater.checkForUpdates()
  createTray()
  createPanel()
  checkForProcess()
});

app.setLoginItemSettings({
  openAtLogin: true,
});

app.on('quit', () => {
  try {
    tray.destroy()
  } catch (e) { }
});

ipcMain.on('app_version', (event) => {
  event.sender.send('app_version', { version: app.getVersion() });
});
