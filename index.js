const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const AutoLaunch = require('auto-launch');
const chokidar = require('chokidar'); // Import chokidar for file watching
const path = require('path');
const { exec } = require('child_process');

// Disable hardware acceleration as early as possible
app.disableHardwareAcceleration();

let Store; // Declare a variable to hold the dynamically imported Store
let win = null; // Global variable to hold the current window instance

// Check if another instance of the app is already running
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit(); // Quit the app if another instance is already running
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // If the app is already running, focus on the existing window
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.on('ready', () => {
        createWindow();
    });

    // Function to create the window
    async function createWindow() {
        if (!Store) {
            // Dynamically import Store
            try {
                Store = (await import('electron-store')).default;
            } catch (error) {
                console.error('Error importing electron-store:', error);
                return;
            }
        }

        const store = new Store();
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        const endYPos = height - 620;
        const theme = store.get('theme') || 'light'; // Get the saved theme or default to 'light'

        if (!win || win.isDestroyed()) {
            win = new BrowserWindow({
                width: 800,
                height: 600,
                x: Math.round((width - 800) / 2),
                y: endYPos,
                frame: false,
                roundedCorners: true,
                skipTaskbar: true,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    // preload: path.join(__dirname, 'preload.js'), // Remove or comment out this line if not used
                }
            });

            // Load the URL with the appropriate theme parameter
            win.loadURL(`https://chatgpt.com/?model=auto`);
            win.setAlwaysOnTop(true, 'screen');

            // Send the current theme to the renderer process
            win.webContents.on('did-finish-load', () => {
                win.webContents.send('set-theme', theme);
            });

            // Load previously saved user data
            const userData = store.get('userData');
            if (userData) {
                win.webContents.send('loadUserData', userData);
            }

            // Close the window if it loses focus
            win.on('blur', () => {
                win.hide();
                win.setSkipTaskbar(true); // Hide from taskbar when not focused
            });

            win.on('closed', () => {
                win = null; // Clear the reference when the window is closed
            });
        } else {
            win.focus();
        }
    }

    // Toggle between light and dark mode
    async function toggleDarkMode() {
        if (!Store) {
            return;
        }

        const store = new Store();
        const darkModeEnabled = store.get('theme') === 'dark';
        const newTheme = darkModeEnabled ? 'light' : 'dark';

        store.set('theme', newTheme);

        // Apply the new theme to the renderer process
        if (win) {
            win.webContents.send('set-theme', newTheme);
        }
    }

    // Check if running as administrator and relaunch if not
    async function checkAndRelaunchAsAdmin() {
        try {
            const { default: isElevated } = await import('is-elevated');
            const elevated = await isElevated();
            if (!elevated) {
                const exePath = path.resolve(process.execPath);
                exec(`powershell Start-Process '${exePath}' -Verb RunAs`, (err) => {
                    if (err) {
                        console.error('Failed to relaunch as administrator:', err);
                    }
                    app.quit(); // Quit the current instance
                });
            }
        } catch (error) {
            console.error('Error checking elevation:', error);
        }
    }

    // Set up auto-launch for the application
    const autoLauncher = new AutoLaunch({
        name: 'YourAppName',
        path: app.getPath('exe'),
    });

    autoLauncher.isEnabled().then((isEnabled) => {
        if (!isEnabled) autoLauncher.enable();
    });

    app.whenReady().then(() => {
        checkAndRelaunchAsAdmin(); // Ensure the app runs with admin privileges

        // Register shortcut to toggle the window with Ctrl+Shift+O
        globalShortcut.register('Control+Shift+O', () => {
            if (win) {
                if (win.isDestroyed()) {
                    win = null;
                }
            }
            if (!win) {
                createWindow();
            } else {
                win.isVisible() ? win.hide() : win.show();
            }
        });

        // Register F1 to show window and make it appear in the taskbar
        globalShortcut.register('F1', () => {
            if (win) {
                win.show();
                win.focus();
                win.setSkipTaskbar(false); // Show in the taskbar when F1 is pressed
            }
        });

        // Register F2 to toggle between dark mode
        globalShortcut.register('F2', toggleDarkMode);

        // Watch for changes in index.js (or other files)
        const watcher = chokidar.watch(path.join(__dirname, 'index.js'), {
            persistent: true,
        });

        watcher.on('change', () => {
            console.log('File change detected. Restarting app...');
            app.relaunch(); // Relaunch the app
            app.exit(); // Exit the current instance
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (win === null) {
            createWindow();
        }
    });

    app.on('before-quit', () => {
        const store = new Store();
        const userData = { /* collect your data here */ };
        store.set('userData', userData);
    });
}
