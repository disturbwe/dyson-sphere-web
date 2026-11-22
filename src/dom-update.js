function syncChildren(host, template) {
  for (let index=0; index<template.childNodes.length; index++) {
    const after=template.childNodes[index];
    const before=host.childNodes[index];
    if (!before) { host.append(after.cloneNode(true)); continue; }
    if (before.isEqualNode(after)) continue;
    if (before.nodeName !== after.nodeName) { before.replaceWith(after.cloneNode(true)); continue; }
    if (before.nodeType === Node.TEXT_NODE) { before.nodeValue=after.nodeValue; continue; }
    for (const name of before.getAttributeNames()) {
      // 展开施工账本是玩家的阅读状态；相邻读数刷新时保留浏览器写入的 open 属性。
      if (name==='open' && before instanceof HTMLDetailsElement)continue;
      if (!after.hasAttribute(name)) before.removeAttribute(name);
    }
    for (const attr of after.attributes) if (before.getAttribute(attr.name)!==attr.value) before.setAttribute(attr.name,attr.value);
    syncChildren(before, after);
    if (before instanceof HTMLSelectElement && before!==document.activeElement) before.value=after.value;
    if (before instanceof HTMLInputElement && before!==document.activeElement) before.value=after.value;
  }
  while (host.childNodes.length>template.childNodes.length) host.lastChild.remove();
}
/** 实时读数只改发生变化的文本和属性，保留同一命令的按钮、输入焦点和滚动容器。页面切换时允许整体替换。 */
export function updateMarkup(el, html, replace=false) {
  if (!replace && el.dataset.last===html) return;
  if (replace || !el.hasChildNodes()) el.innerHTML=html;
  else {
    const template=document.createElement('template');
    template.innerHTML=html;
    syncChildren(el,template.content);
  }
  el.dataset.last=html;
}
