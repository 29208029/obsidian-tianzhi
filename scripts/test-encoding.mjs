// Test GBK vs UTF-8 encoding for Chinese
// 期望: encodeURIComponent("Obsidian自动同步知识库") → UTF-8 hex
const text = "Obsidian自动同步知识库";
console.log("=== UTF-8 (encodeURIComponent) ===");
console.log(encodeURIComponent(text));
console.log("hex:", Buffer.from(text, "utf8").toString("hex"));

console.log("\n=== GBK ===");
// Node Buffer 支持 gbk 编码
console.log("hex:", Buffer.from(text, "gbk").toString("hex"));
console.log("encoded:", encodeURIComponent(Buffer.from(text, "gbk").toString("binary")));

console.log("\n=== Without encoding (raw) ===");
console.log(text);
