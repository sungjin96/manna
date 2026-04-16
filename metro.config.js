const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// .db 파일을 asset으로 번들링 (Android 프로덕션 빌드에서 SQLite DB 파일 포함)
config.resolver.assetExts.push('db');

module.exports = config;
