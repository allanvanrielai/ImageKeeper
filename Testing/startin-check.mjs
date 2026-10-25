// Opens the real Save dialog from Save All in a headed throwaway Chrome and reports which folder it opens in (read through Windows UI Automation), then closes the throwaway Chrome, which discards the dialog.
// Nothing is saved. Usage: node startin-check.mjs <app folder>
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";
const PORT = 47695, DBG = 9337;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, path.resolve(process.argv[2]));
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800, headless: false });
await page.goto(`http://127.0.0.1:${PORT}/index.html`); await page.eval(HELPERS); await page.eval(`T.wipe()`);
await page.eval(`(async()=>{ await T.seed([{ id:'a', title:'Check', blob: await T.png(80,60,10), thumb: await T.png(40,30,10), type:'image/png', width:80, height:60, added:Date.now(), saved:false, source:'paste', label:'General' }]); })()`);
await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#list .item').length === 1`);
await page.send("Page.bringToFront");
await page.click("#saveAllBtn"); await sleep(2500);
const script = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$chrome = $root.FindAll([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Image Keeper - Google Chrome')))
'chrome windows named like the test page: ' + $chrome.Count
$found = $false
for ($t = 0; $t -lt 15 -and -not $found; $t++) {
  foreach ($c in $chrome) {
    $d = $c.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')))
    foreach ($dlg in $d) {
      $found = $true
      'DIALOG: ' + $dlg.Current.Name
      foreach ($e in $dlg.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) { $n = $e.Current.Name; if ($n -match '^Address' -or $n -match 'Downloads|Save in|File name|Folder') { '  ' + $e.Current.ControlType.ProgrammaticName + ' | ' + $n } }
    }
  }
  if (-not $found) { Start-Sleep -Milliseconds 400 }
}
if (-not $found) { 'NO DIALOG under the test window' }
`;console.log(execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " + script], { encoding: "utf8", timeout: 60000 }));
// the dialog is left open on purpose: closing the throwaway Chrome (below) discards it, so nothing is saved
await page.close(); srv.kill();
