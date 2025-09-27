'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 8080;
const ROOT = process.cwd();

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml; charset=utf-8',
	'.ico': 'image/x-icon'
};

function send(res, status, headers, body) {
	res.writeHead(status, headers);
	res.end(body);
}

const server = http.createServer((req, res) => {
	const urlPath = decodeURIComponent(req.url.split('?')[0]);
	let filePath = path.join(ROOT, urlPath);

	fs.stat(filePath, (err, stat) => {
		if (err) {
			// fallback to index.html
			const indexPath = path.join(ROOT, 'index.html');
			fs.readFile(indexPath, (err2, data2) => {
				if (err2) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
				send(res, 200, { 'Content-Type': MIME['.html'] }, data2);
			});
			return;
		}
		if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
		const ext = path.extname(filePath).toLowerCase();
		fs.readFile(filePath, (err3, data) => {
			if (err3) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
			send(res, 200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }, data);
		});
	});
});

server.listen(PORT, () => {
	console.log(`Static server running at http://localhost:${PORT}`);
});


