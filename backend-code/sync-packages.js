// sync-packages.js
require('dotenv').config();
const { query } = require('./config/database');

async function main() {
  try {
    const pkgs = [
      { id: 1, name: '\u65b0\u7528\u6237\u793c\u5305', credits: 50,   price: 0,   description: '\u65b0\u7528\u6237\u4e13\u4eab\uff0c\u514d\u8d39\u9886\u53d650\u79ef\u5206', sort_order: 1 },
      { id: 2, name: '\u57fa\u7840\u5957\u9910', credits: 100,  price: 10,  description: '100\u79ef\u5206\uff0c\u9002\u5408\u8f7b\u5ea6\u4f7f\u7528', sort_order: 2 },
      { id: 3, name: '\u6807\u51c6\u5957\u9910', credits: 200,  price: 20,  description: '200\u79ef\u5206\uff0c\u6027\u4ef7\u6bd4\u4e4b\u9009', sort_order: 3 },
      { id: 4, name: '\u70ed\u95e8\u5957\u9910', credits: 500,  price: 50,  description: '500\u79ef\u5206\uff0c\u6700\u53d7\u6b22\u8fce', sort_order: 4 },
      { id: 5, name: '\u8d85\u5024\u5957\u9910', credits: 1000, price: 100, description: '1000\u79ef\u5206\uff0c\u5927\u989d\u4f18\u60e0', sort_order: 5 },
    ];

    // Get existing ids
    const existing = await query('SELECT id FROM credit_packages');
    const existingIds = existing.map(r => r.id);

    for (const p of pkgs) {
      if (existingIds.includes(p.id)) {
        await query(
          'UPDATE credit_packages SET name=?, credits=?, price=?, description=?, is_active=1, sort_order=? WHERE id=?',
          [p.name, p.credits, p.price, p.description, p.sort_order, p.id]
        );
        console.log('Updated:', p.id, p.name, p.credits, 'credits');
      } else {
        await query(
          'INSERT INTO credit_packages (id, name, credits, price, description, is_active, sort_order) VALUES (?,?,?,?,?,1,?)',
          [p.id, p.name, p.credits, p.price, p.description, p.sort_order]
        );
        console.log('Inserted:', p.id, p.name, p.credits, 'credits');
      }
    }

    // Deactivate any extra packages not in our list
    const ourIds = pkgs.map(p => p.id);
    for (const r of existing) {
      if (!ourIds.includes(r.id)) {
        await query('UPDATE credit_packages SET is_active=0 WHERE id=?', [r.id]);
        console.log('Deactivated extra package id:', r.id);
      }
    }

    const rows = await query('SELECT id, name, credits, price, is_active FROM credit_packages ORDER BY sort_order');
    console.log('\nFinal credit_packages:');
    rows.forEach(r => console.log(' ', r.id, r.name, r.credits + 'pts', '\uffe5' + r.price, r.is_active ? '[active]' : '[inactive]'));
    console.log('\nDone!');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
