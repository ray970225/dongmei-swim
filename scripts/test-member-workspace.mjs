import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { MemberWorkspace } = await server.ssrLoadModule('/src/education-app.jsx');
  const markup = renderToStaticMarkup(React.createElement(MemberWorkspace, {
    displayName: '會員測試',
    data: {
      categories: [],
      articles: [{ id: 'private-article', title: 'PRIVATE ARTICLE TITLE', summary: 'PRIVATE SUMMARY', body: [{ text: 'PRIVATE BODY' }] }],
      deadlines: [], libraryLoading: false, libraryError: ''
    },
    actions: { onOpenLibrary() {}, onRetry() {}, onLoadAttachments: async () => [], onSignAttachment: async () => '' }
  }));
  assert.match(markup, /會員工作台/);
  assert.match(markup, /開啟升學資料庫/);
  assert.match(markup, /選手資料/);
  assert.match(markup, /帳號安全/);
  assert.match(markup, /href="account-settings\.html"/);
  assert.doesNotMatch(markup, /PRIVATE ARTICLE TITLE|PRIVATE SUMMARY|PRIVATE BODY/);
  const adminPage = await readFile(new URL('../admin-v2.html', import.meta.url), 'utf8');
  const adminHeader = adminPage.match(/<header class="v2-header">[\s\S]*?<\/header>/)?.[0] || '';
  const adminHome = adminPage.match(/<section id="adminHome"[\s\S]*?<\/section>\s*<section id="adminTaskHeader"/)?.[0] || '';
  assert.doesNotMatch(adminHeader, /account-settings\.html|修改密碼/);
  assert.match(adminHome, /帳號安全[\s\S]*?href="account-settings\.html"/);
  const memberPage = await readFile(new URL('../education.html', import.meta.url), 'utf8');
  const memberHeader = memberPage.match(/<header class="v2-header">[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(memberHeader, /account-settings\.html|修改密碼/);
  console.log('Member workspace initial view test passed.');
} finally {
  await server.close();
}
