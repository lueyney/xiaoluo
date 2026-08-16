require('dotenv').config();
const { query } = require('../config/database');

(async () => {
  try {
    const cols = await query('SHOW COLUMNS FROM documents');
    const colNames = cols.map(c => c.Field);
    console.log('Current columns:', colNames.join(', '));

    if (!colNames.includes('status')) {
      await query("ALTER TABLE documents ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'completed'");
      console.log('Added: status');
    }
    if (!colNames.includes('order_id')) {
      await query('ALTER TABLE documents ADD COLUMN order_id INT DEFAULT NULL');
      console.log('Added: order_id');
    }
    if (!colNames.includes('rewrite_docx_path')) {
      await query('ALTER TABLE documents ADD COLUMN rewrite_docx_path VARCHAR(500) DEFAULT NULL');
      console.log('Added: rewrite_docx_path');
    }

    await query("UPDATE documents SET status = 'completed' WHERE status IS NULL OR status = ''");
    console.log('Updated existing docs status to completed');

    const sample = await query('SELECT id, title, status, order_id FROM documents LIMIT 3');
    console.log('Sample:', JSON.stringify(sample));
    console.log('Migration done.');
  } catch (e) {
    console.error('Migration error:', e.message);
  }
  process.exit(0);
})();
