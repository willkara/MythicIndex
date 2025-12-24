
-- Seed data for unified_content

INSERT INTO unified_content (id, type, slug, title, markdown_content, word_count, created_at, updated_at) VALUES
('uuid-char-1', 'CHARACTER', 'elara-vance', 'Elara Vance', '# Elara Vance\n\nA skilled rogue with a mysterious past.', 8, unixepoch(), unixepoch()),
('uuid-char-2', 'CHARACTER', 'kaelen-stone', 'Kaelen Stone', '# Kaelen Stone\n\nA stoic paladin of the Silver flame.', 8, unixepoch(), unixepoch()),
('uuid-loc-1', 'LOCATION', 'silver-keep', 'Silver Keep', '# Silver Keep\n\nThe ancestral home of the Stone family.', 8, unixepoch(), unixepoch()),
('uuid-chap-1', 'CHAPTER', 'chapter-1', 'Chapter 1: The Arrival', '# Chapter 1: The Arrival\n\nElara approached the gates of Silver Keep under the cover of darkness.', 13, unixepoch(), unixepoch());
