import assert from 'node:assert/strict';
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
  assert.doesNotMatch(markup, /PRIVATE ARTICLE TITLE|PRIVATE SUMMARY|PRIVATE BODY/);
  console.log('Member workspace initial view test passed.');
} finally {
  await server.close();
}
