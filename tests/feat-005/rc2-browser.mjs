import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {constants} from 'node:fs';
import {startPreview} from './preview-server.mjs';import {rpc,ids} from './fixture.mjs';
const output=new URL('../../docs/feat-005/evidence/rc2/',import.meta.url);await mkdir(output,{recursive:true});
try{const previous=JSON.parse(await readFile(new URL('browser.json',output),'utf8'));if(previous.status==='FAIL')await copyFile(new URL('browser.json',output),new URL('browser-before.json',output),constants.COPYFILE_EXCL);}catch(e){if(!['ENOENT','EEXIST'].includes(e.code))throw e;}
const fixture=await startPreview();let browser;const result={checks:[],errors:[],status:'RUNNING'};
try{
 const db=fixture.db;const n=(await rpc(db,ids.s,'load')).notices[0];
 const cat=await rpc(db,ids.a,'catalog_save',{grade:7,name:'Tiếng Anh kiểm chứng',is_english:true},'');
 const subject=await rpc(db,ids.t,'subject_save',{catalog_subject_id:cat.id});const group=await rpc(db,ids.t,'group_save',{name:'Nhóm English kiểm chứng'});
 await rpc(db,ids.t,'group_assign',{student_id:ids.s,english_group_id:group.id});
 await rpc(db,ids.t,'correction_request',{id:n.id,issue_types:['subject'],reason:'Sửa môn và nhóm áp dụng'});
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 context.on('page',p=>{p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});});
 const page=await context.newPage();await page.goto('http://127.0.0.1:4175/tests/feat-005/preview.html?role=student');
 const trigger=page.getByRole('button',{name:'Sửa',exact:true});await trigger.click();const modal=page.getByRole('dialog');await expect(modal).toBeVisible();
 const inside=()=>page.evaluate(()=>document.querySelector('[role=dialog]').contains(document.activeElement));
 expect(await inside(),'R-002 focus enters correction editor').toBe(true);
 const first=modal.getByRole('combobox',{name:'Môn học',exact:true});const last=modal.getByRole('button',{name:'Gửi lại GV',exact:true});
 await last.focus();await page.keyboard.press('Tab');await expect(first).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();
 await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await modal.getByRole('button',{name:'Đóng',exact:true}).click();await expect(trigger).toBeFocused();
 result.checks.push('R-002: focus entry, Tab/Shift+Tab wrapping, Escape and Close return to trigger');
 await trigger.click();await first.selectOption(subject.id);await modal.getByRole('combobox',{name:'Lớp Tiếng Anh áp dụng'}).selectOption(group.id);
 await modal.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await expect(page.getByText('Đã lưu bản nháp riêng tư',{exact:false})).toBeVisible();
 await expect(modal.getByRole('button',{name:'Lưu bản nháp',exact:true})).toBeEnabled();
 await expect.poll(inside).toBe(true);
 result.focusAfterSave=await page.evaluate(()=>{const d=document.querySelector('[role=dialog]');return {tag:document.activeElement.tagName,text:document.activeElement.textContent.slice(0,100),open:d.open,modal:d.matches(':modal'),inside:d.contains(document.activeElement)}});
 expect(await inside()).toBe(true);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 await page.screenshot({path:fileURLToPath(new URL('editor-mobile.png',output)),fullPage:true});
 await modal.getByRole('button',{name:'Gửi lại GV',exact:true}).click();await expect(modal).toHaveCount(0);
 const teacher=await context.newPage();await teacher.goto('http://127.0.0.1:4175/tests/feat-005/preview.html?role=teacher');
 await teacher.getByRole('button',{name:'Yêu cầu chỉnh sửa',exact:true}).click();await teacher.locator('.correction-panel details').first().locator('summary').click();
 const published=teacher.locator('.revision-comparison section').first();const submitted=teacher.locator('.revision-comparison section').last();
 await expect(published).toContainText('Toán');await expect(published).toContainText('Không áp dụng');
 await expect(submitted).toContainText('Tiếng Anh kiểm chứng');await expect(submitted).toContainText('Nhóm English kiểm chứng');
 await teacher.screenshot({path:fileURLToPath(new URL('teacher-comparison-desktop.png',output)),fullPage:true});
 await teacher.setViewportSize({width:390,height:844});expect(await teacher.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 await teacher.screenshot({path:fileURLToPath(new URL('teacher-comparison-mobile.png',output)),fullPage:true});
 await teacher.getByRole('button',{name:'Đạt',exact:true}).click();await expect(teacher.getByText('Đã xác nhận và công bố chỉnh sửa.',{exact:true})).toBeVisible();
 const approved=(await rpc(db,ids.s,'load')).notices.find(x=>x.id===n.id);expect(approved.subject_id).toBe(subject.id);expect(approved.english_group_id).toBe(group.id);
 result.checks.push('R-001: old/new subject and group visible, desktop/mobile no overflow, approval publishes checked revision');
 expect(result.errors).toEqual([]);result.status='PASS';
}catch(e){result.status='FAIL';result.error=e.stack;throw e;}
finally{await browser?.close();await fixture.close();result.executed_at=new Date().toISOString();await writeFile(new URL('browser.json',output),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
