'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import GObject from 'gi://GObject?version=2.0';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as WindowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';

import { FildemGlobalMenuSettings as Settings } from './settings.js';

const WinTracker = Shell.WindowTracker.get_default();

const WindowActions = class WindowActions {
    constructor(ext) {
        this.ext = ext;
        this._win = global.display.get_focus_window();
        this.actions = [];
    }

    getActions() {
        if (!this._win) return this.actions;
        
        let type = this._win.get_window_type();
        let win = this._win;

        if (win.can_minimize())
            this.actions.push('Minimize');

        if (win.can_maximize()) {
            let isMaximized = typeof win.is_maximized === 'function' ? win.is_maximized() : win.get_maximized();
            this.actions.push(isMaximized ? 'Unmaximize' : 'Maximize');
        }

        if (win.allows_move())
            this.actions.push('Move');

        if (win.allows_resize())
            this.actions.push('Resize');

        if (win.titlebar_is_onscreen() && type != Meta.WindowType.DOCK && type != Meta.WindowType.DESKTOP)
            this.actions.push('Move Titlebar Onscreen');

        let isMax = typeof win.is_maximized === 'function' ? win.is_maximized() : win.get_maximized();
        if (isMax
            || type == Meta.WindowType.DOCK
            || type == Meta.WindowType.DESKTOP
            || type == Meta.WindowType.SPLASHSCREEN) {

            this.actions.push('Always on Top' + (win.is_above() ? ' ✓' : ''));
        }

        if (Main.sessionMode.hasWorkspaces
            && (!Meta.prefs_get_workspaces_only_on_primary() || win.is_on_primary_monitor())) {

            let isSticky = win.is_on_all_workspaces();

            if (win.is_always_on_all_workspaces()) {
                this.actions.push('Always on Visible Workspace' + (isSticky ? ' ✓' : ''));
            }

            if (!isSticky) {
                let workspace = win.get_workspace();
                if (workspace != workspace.get_neighbor(Meta.MotionDirection.LEFT))
                    this.actions.push('Move to Workspace Left');

                if (workspace != workspace.get_neighbor(Meta.MotionDirection.RIGHT))
                    this.actions.push('Move to Workspace Right');

                if (workspace != workspace.get_neighbor(Meta.MotionDirection.UP))
                    this.actions.push('Move to Workspace Up');

                if (workspace != workspace.get_neighbor(Meta.MotionDirection.DOWN))
                    this.actions.push('Move to Workspace Down');
            }
        }

        let display = global.display;
        let nMonitors = display.get_n_monitors();
        let monitorIndex = win.get_monitor();
        if (nMonitors > 1 && monitorIndex >= 0) {
            let dir = Meta.DisplayDirection.UP;
            let upMonitorIndex = display.get_monitor_neighbor_index(monitorIndex, dir);
            if (upMonitorIndex != -1) this.actions.push('Move to Monitor Up');

            dir = Meta.DisplayDirection.DOWN;
            let downMonitorIndex = display.get_monitor_neighbor_index(monitorIndex, dir);
            if (downMonitorIndex != -1) this.actions.push('Move to Monitor Down');

            dir = Meta.DisplayDirection.LEFT;
            let leftMonitorIndex = display.get_monitor_neighbor_index(monitorIndex, dir);
            if (leftMonitorIndex != -1) this.actions.push('Move to Monitor Left');

            dir = Meta.DisplayDirection.RIGHT;
            let rightMonitorIndex = display.get_monitor_neighbor_index(monitorIndex, dir);
            if (rightMonitorIndex != -1) this.actions.push('Move to Monitor Right');
        }

        if (win.can_close())
            this.actions.push('Close');

        return this.actions;
    }

    _doAction(action) {
        if (!this._win) return;
        
        if (action.endsWith(' ✓')) {
            action = action.substr(0, action.length - 2);
        }
        let win = this._win;
        switch (action) {
            case 'Minimize': win.minimize(); break;
            case 'Unmaximize':
                if (typeof win.set_maximize_flags === 'function') win.unmaximize();
                else win.unmaximize(Meta.MaximizeFlags.BOTH);
                break;
            case 'Maximize': 
                if (typeof win.set_maximize_flags === 'function') win.maximize();
                else win.maximize(Meta.MaximizeFlags.BOTH);
                break;
            case 'Move':
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    WindowMenu.WindowMenu.prototype._grabAction(win, Meta.GrabOp.KEYBOARD_MOVING, global.display.get_current_time_roundtrip());
                });
                break;
            case 'Resize':
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    WindowMenu.WindowMenu.prototype._grabAction(win, Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN, global.display.get_current_time_roundtrip());
                });
                break;
            case 'Move Titlebar Onscreen': win.shove_titlebar_onscreen(); break;
            case 'Always on Top':
                if (win.is_above()) win.unmake_above();
                else win.make_above();
                break;
            case 'Always on Visible Workspace':
                if (win.is_on_all_workspaces()) win.unstick();
                else win.stick();
                break;
            case 'Move to Workspace Left': this._moveToWorkspace(Meta.MotionDirection.LEFT); break;
            case 'Move to Workspace Right': this._moveToWorkspace(Meta.MotionDirection.RIGHT); break;
            case 'Move to Workspace Up': this._moveToWorkspace(Meta.MotionDirection.UP); break;
            case 'Move to Workspace Down': this._moveToWorkspace(Meta.MotionDirection.DOWN); break;
            case 'Move to Monitor Up': this._moveToMonitor(Meta.DisplayDirection.UP); break;
            case 'Move to Monitor Down': this._moveToMonitor(Meta.DisplayDirection.DOWN); break;
            case 'Move to Monitor Left': this._moveToMonitor(Meta.DisplayDirection.LEFT); break;
            case 'Move to Monitor Right': this._moveToMonitor(Meta.DisplayDirection.RIGHT); break;
            case 'Close': win.delete(global.get_current_time()); break;
        }
    }

    _moveToWorkspace(dir) {
        let workspace = this._win.get_workspace();
        this._win.change_workspace(workspace.get_neighbor(dir));
    }

    _moveToMonitor(dir) {
        let monitorIndex = this._win.get_monitor();
        let newMonitorIndex = global.display.get_monitor_neighbor_index(monitorIndex, dir);
        if (newMonitorIndex != -1) {
            this._win.move_to_monitor(newMonitorIndex);
        }
    }
}

var MenuButton = GObject.registerClass(
class MenuButton extends PanelMenu.Button {
    _init(label, menuBar, ext) {
        super._init(0.0, label.replace('_', ''), true);
        
        this._label = label.replace('_', '');
        this._menuBar = menuBar;
        this.ext = ext;

        this.box = new St.BoxLayout({ style_class: 'panel-status-menu-box menubar-button' });
        this.labelWidget = new St.Label({
            text: this._label,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false
        });
        
        this.box.add_child(this.labelWidget);
        this.add_child(this.box);
        
        this.connect('button-press-event', this._onButtonPress.bind(this));
    }

    _onButtonPress(actor, event) {
        if (event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;

        this._menuBar.onButtonClicked(this._label);
        return Clutter.EVENT_STOP;
    }

    _onStyleChanged(actor) {
        super._onStyleChanged(actor);
        let padding = this.ext.customSettings.get_int('min-padding');
        this._minHPadding = padding;
        this._natHPadding = padding;
    }
});

class Cache {
    constructor() {
        this.N = 10;
        this.lru = [];
        this.entries = {};
        this.lastQueriedKey = '';
    }

    get(key) {
        this.lastQueriedKey = key;
        return this.entries[key];
    }

    _set(key, value) {
        if (this.entries[key]) {
            this.lru.splice(this.lru.indexOf(key), 1);
        }
        this.lru.push(key);
        this.entries[key] = value;

        if (this.lru.length > this.N) {
            const toRemove = this.lru.pop();
            this.entries[toRemove] = undefined;
        }
    }

    withCache(f) {
        return (param) => {
            this._set(this.lastQueriedKey, param);
            f(param);
        };
    }
}

class MenuBar {
    constructor(proxy, ext) {
        this._menuButtons = [];
        this._proxy = proxy;
        this.ext = ext;
        this._width_offset = 300;
        this.MARGIN_FIRST_ELEMENT = 4;
        this._isShowingMenu = false;

        this._cache = new Cache();

        this._notifyFocusWinId = global.display.connect('notify::focus-window', this._onWindowSwitched.bind(this));
        this._proxy.listeners['SendTopLevelMenus'].push(this._cache.withCache(this.setMenus.bind(this)));
        this._proxy.listeners['MenuOnOff'].push(this._onMenuOnOff.bind(this));
        
        Main.panel.reactive = true;
        Main.panel.track_hover = true;

        this._panelEvHandlers = [];
        this._forceShowMenu = false;
        this.setForceShowMenu();

        Main.overview.connect('showing', this._onOverviewOpened.bind(this));
        Main.overview.connect('hiding', this._onOverviewClosed.bind(this));
    }

    setForceShowMenu() {
        this._forceShowMenu = !this.ext.customSettings.get_boolean('show-only-when-hover');

        if (!this._forceShowMenu) {
            this._panelEvHandlers.push(Main.panel.connect('enter-event', this._onPanelEnter.bind(this)));
            this._panelEvHandlers.push(Main.panel.connect('leave-event', this._onPanelLeave.bind(this)));
        } else {
            for (let h of this._panelEvHandlers) {
                Main.panel.disconnect(h);
            }
            this._panelEvHandlers = [];
        }
    }

    addMenuButton(label, setmargin) {
        try {
            let menuButton = new MenuButton(label, this, this.ext);
            this._menuButtons.push(menuButton);
            const nItems = Main.panel._leftBox.get_children().length;
            menuButton.hide();
            
            if (setmargin) {
                menuButton.set_style(`margin-left: ${this.MARGIN_FIRST_ELEMENT}px`);
            }
                
            Main.panel.addToStatusArea(`fildem-menu-${label}`, menuButton, nItems, 'left');
        } catch (e) {
            this.ext.logError(`Error adding menu button: ${e.message}`);
        }
    }

    setMenus(menus) {
        try {
            if (!menus) return;
            
            if (menus.length === 0) {
                this._hideMenu();
            }
            this.removeAll();
            
            let first = true;
            for (let menu of menus) {
                this.addMenuButton(menu, first);
                first = false;
            }
            if (this._forceShowMenu && !Main.overview.visibleTarget) {
                this._onPanelEnter();
            }
        } catch (e) {
            this.ext.logError(`Crash in setMenus: ${e.message}`);
        }
    }

    _onPanelEnter() {
        if (this._menuButtons.length === 0 || Main.overview.visibleTarget) return;
        this._calculateOffset();
        this._showMenu();
    }

    _calculateOffset() {
        if (this._menuButtons.length > 0) {
            try {
                let [x, y] = this._menuButtons[0].get_transformed_position();
                this._width_offset = x;
            } catch (e) {
                this.ext.logError(`Error calculating offset: ${e.message}`);
            }
        }
    }

    _showMenu() {
        this._menuButtons.forEach(btn => {
            btn.show();
            btn.ease({
                opacity: 255,
                mode: Clutter.AnimationMode.EASE_OUT_QUART,
                duration: 250
            });
        });
    }

    _onPanelLeave() {
        if (this._isShowingMenu || this._forceShowMenu) return;
        this._hideMenu();
    }

    async _hideMenu() {
        let promises = this._menuButtons.map(btn => {
            return new Promise(resolve => {
                if (typeof btn.easeAsync === 'function') {
                    btn.easeAsync({
                        opacity: 0,
                        mode: Clutter.AnimationMode.EASE_OUT_QUART,
                        duration: 100
                    }).then(() => {
                        btn.hide();
                        resolve();
                    }).catch(e => {
                        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                            this.ext.logError(`Error hiding button: ${e.message}`);
                        }
                        resolve();
                    });
                } else {
                    btn.ease({
                        opacity: 0,
                        mode: Clutter.AnimationMode.EASE_OUT_QUART,
                        duration: 100,
                        onComplete: () => {
                            btn.hide();
                            resolve();
                        }
                    });
                }
            });
        });
        await Promise.all(promises);
    }

    _onMenuOnOff(on) {
        if (on) {
            this._onPanelEnter();
            this.onButtonClicked('__fildem_move');
        } else {
            this._isShowingMenu = false;
            this._onPanelLeave();
        }
    }

    onButtonClicked(label) {
        this._isShowingMenu = true;
        this._calculateOffset(); 
        this._proxy.EchoSignal(label, this._width_offset);
    }

    removeAll() {
        for (let e of this._menuButtons) {
            try {
                e.destroy();
            } catch (err) {
                this.ext.logError(`Error destroying button: ${err.message}`);
            }
        }
        this._menuButtons = [];
    }

    _onWindowSwitched() {
        this.removeAll();
        this._hideMenu();
        const focusApp = WinTracker.focus_app; 
        
        if (focusApp) {
            let appId = focusApp.get_id() || '';

            let cachedValue = this._cache.get(appId);
            if (cachedValue) {
                this.setMenus(cachedValue);
            }

            let windowData = {};
            let win = focusApp.get_windows()[0];
            let xid = '';
            
            try {
                if (win && win.get_description()) {
                    let match = win.get_description().match(/0x[0-9a-f]+/);
                    if (match) xid = parseInt(match[0]);
                }
            } catch (e) {
                this.ext.logError(`Error getting window XID: ${e.message}`);
            }
            
            windowData['xid'] = String(xid);
            for (let p in win) {
                if (p.startsWith('gtk_') && win[p] != null) {
                    windowData[p] = win[p];
                }
            }
            this._proxy.WindowSwitched(windowData);
        }
    }

    _onOverviewOpened() {
        this._hideMenu();
    }

    _onOverviewClosed() {
        if (this._forceShowMenu && this._menuButtons.length) {
            this._calculateOffset();
            this._showMenu();
        }
    }

    _disconnectAll() {
        for (let h of this._panelEvHandlers) {
            Main.panel.disconnect(h);
        }
        global.display.disconnect(this._notifyFocusWinId);
    }

    destroy() {
        this._disconnectAll();
        this.removeAll();
    }
}

const ifaceXml = `
<node>
  <interface name="com.gonzaarcr.appmenu">
    <method name="EchoSignal">
      <arg type="s" direction="in" name="menu"/>
      <arg type="u" direction="in" name="x"/>
    </method>
    <method name="WindowSwitched">
      <arg name="win_data" type="a{ss}" direction="in"/>
    </method>

    <signal name="WindowSwitchedSignal">
      <arg name="win_data" type="a{ss}"/>
    </signal>
    <signal name="MenuActivated">
      <arg name="menu" type="s"/>
      <arg name="x" type="u"/>
    </signal>

    <method name="EchoMenuOnOff">
      <arg name="on" type="b" direction="in"/>
    </method>
    <signal name="MenuOnOff">
      <arg name="on" type="b"/>
    </signal>

    <method name="SendTopLevelMenus">
      <arg name="top_level_menus" type="as" direction="in"/>
    </method>
    <signal name="SendTopLevelMenusSignal">
      <arg name="top_level_menus" type="as"/>
    </signal>

    <method name="RequestWindowActions"/>
    <signal name="RequestWindowActionsSignal"/>

    <method name="ListWindowActions">
      <arg name="actions" type="as" direction="in"/>
    </method>
    <signal name="ListWindowActionsSignal">
      <arg name="actions" type="as"/>
    </signal>

    <method name="ActivateWindowAction">
      <arg name="action" type="s" direction="in"/>
    </method>
    <signal name="ActivateWindowActionSignal">
      <arg name="action" type="s"/>
    </signal>
  </interface>
</node>`;

const TestProxy = Gio.DBusProxy.makeProxyWrapper(ifaceXml);
const BUS_NAME = 'com.gonzaarcr.appmenu';
const BUS_PATH = '/com/gonzaarcr/appmenu';

class MyProxy {
    constructor(ext) {
        this.ext = ext;
        this._handlerIds = [];
        this.listeners = {
            'MenuActivated': [],
            'SendTopLevelMenus': [],
            'MenuOnOff': []
        };
        this._createProxy();
    }

    _createProxy() {
        this._proxy = new TestProxy(
            Gio.DBus.session,
            BUS_NAME,
            BUS_PATH,
            this._onProxyReady.bind(this)
        );
    }

    _onProxyReady(result, error) {
        if (error) {
            this.ext.logError(`DBus initialization error: ${error}`);
            return;
        }
        this._handlerIds.push(this._proxy.connectSignal('SendTopLevelMenus', this._onSendTopLevelMenus.bind(this)));
        this._handlerIds.push(this._proxy.connectSignal('RequestWindowActionsSignal', this._onRequestWindowActionsSignal.bind(this)));
        this._handlerIds.push(this._proxy.connectSignal('ActivateWindowActionSignal', this._onActivateWindowActionSignal.bind(this)));
        this._handlerIds.push(this._proxy.connectSignal('MenuOnOff', this._onMenuOnOff.bind(this)));
    }

    _onSendTopLevelMenus(proxy, nameOwner, args) {
        try {
            let topLevelMenus = args[0];
            for (let callback of this.listeners['SendTopLevelMenus']) {
                callback(topLevelMenus);
            }
        } catch (e) {
            this.ext.logError(`Crash in _onSendTopLevelMenus: ${e.message}`);
        }
    }

    _onRequestWindowActionsSignal(proxy, nameOwner, args) {
        try {
            this._currentWindow = new WindowActions(this.ext);
            let actions = this._currentWindow.getActions();
            this._proxy.ListWindowActionsRemote(actions);
        } catch (e) {
            this.ext.logError(`Crash in _onRequestWindowActionsSignal: ${e.message}`);
        }
    }

    _onActivateWindowActionSignal(proxy, nameOwner, args) {
        try {
            this._currentWindow._doAction(args[0]);
        } catch (e) {
            this.ext.logError(`Crash in _onActivateWindowActionSignal: ${e.message}`);
        }
    }

    _onMenuOnOff(proxy, nameOwner, args) {
        try {
            for (let callback of this.listeners['MenuOnOff']) {
                callback(args[0]);
            }
        } catch (e) {
            this.ext.logError(`Crash in _onMenuOnOff: ${e.message}`);
        }
    }

    WindowSwitched(windowData) {
        try {
            this._proxy.WindowSwitchedRemote(windowData);
        } catch (e) {
            this.ext.logError(`Crash in WindowSwitched: ${e.message}`);
        }
    }

    EchoSignal(menu, x) {
        try {
            this._proxy.EchoSignalRemote(menu, x);
        } catch (e) {
            this.ext.logError(`Crash in EchoSignal: ${e.message}`);
        }
    }

    destroy() {
        for (let id of this._handlerIds) {
            this._proxy.disconnectSignal(id);
        }
        this._handlerIds = [];
    }
}

export default class FildemMenuExtension extends Extension {
    logInfo(msg) {
        if (this.logger) this.logger.info(msg);
        else console.log(`[FILDEM_MENU] ${msg}`);
    }

    logError(msg) {
        if (this.logger) this.logger.error(msg);
        else console.error(`[FILDEM_MENU] ${msg}`);
    }

    logDebug(msg) {
        if (this.logger) this.logger.debug(msg);
        else console.log(`[FILDEM_MENU] [DEBUG] ${msg}`);
    }

    enable() {
        this.customSettings = new Settings(this, this.metadata['settings-schema']);
        this._handlerIds = [];
        
        this.myProxy = new MyProxy(this);
        this.menubar = new MenuBar(this.myProxy, this);

        this._handlerIds.push(this.customSettings.connect(
            'changed::show-only-when-hover',
            () => { this.menubar.setForceShowMenu(); }
        ));
    }

    disable() {
        for (let h of this._handlerIds) {
            this.customSettings.disconnect(h);
        }
        this._handlerIds = [];

        if (this.menubar) {
            this.menubar.destroy();
            this.menubar = null;
        }
        if (this.myProxy) {
            this.myProxy.destroy();
            this.myProxy = null;
        }
        this.customSettings = null;
    }
}