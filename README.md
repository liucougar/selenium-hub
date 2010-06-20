Selenium-hub
============
[node.js] based [selenium-grid] replacement to run multiple tests in parallel, on multiple machines, in an heterogeneous enviroment.  Selenium-hub enables easy deployment of multiple instances of [selenium-rc] to run tests in parallel.

This is designed to be a drop-in replacement for selenium-grid. (If you are not using features currently missing in Selenium-hub)

FEATURES
--------
  * the hub is transparent: it acts as if it's a real selenium-rc
  * it maintains a list of available (registered) RCs. When client requests a particular browser on a particular platform, hub will try to fullfill it, if can't, it will wait for one or timeout
  * RC locking: a browser session will always be handled by the same RC. in addition, a RC can be locked so it won't be used to serve another client driver request with the same lock
  * special RC lock "focus": if focus lock is requested from a client driver, it will only be fullfiled by a RC without any active browser session. In addition, no other browser session will be assigned to this RC until the browser session with "focus" lock terminates. This special lock is useful for tests which require focus on the browser (such as those using [dojo.robot])
  * automatically close browser sessions if they are not being used for a given timeout

USAGE
-----
TODOC

LICENSE
-------
BSD

Failure Mode
------------
  * client driver fails: remove any registered sessions if any
  * a browser session is not used after a given timeout, hub would close it
  * selenium-rc fails: drop all sessions registered on this rc (TODO); mark this selenium-rc as unavailable, try to reuse it after a timeout
  * hub fails: all client driver would fail, so nothing we can do here

TODO
----
  * move config.json into config.js, add a config.example file
  * when exit, terminate all sessions
  * dynamic configuration change
  * web UI
  * EC2 support
  * are these useful?
    * chained hubs: one hub can use another hub as a selenium-rc
    * prioritized client driver requests: a chained hub may requests high priority requests which will be fulfilled before other waiting normal requests

[node.js]: http://nodejs.org/
[selenium-grid]: http://selenium-grid.seleniumhq.org/
[selenium-rc]: http://seleniumhq.org/projects/remote-control/
[dojo.robot]: http://o.dojotoolkit.org/2008/08/11/doh-robot-automating-web-ui-unit-tests-real-user-events
