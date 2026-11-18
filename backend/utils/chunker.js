

function chunkText(text, size = 600, overlap = 100) {

    //get text , slice it in given chaecter in for loop overlapp by 100
    //loop run 600 chunks add 
    const chunks = []
    for (let i = 0; i < text.length; i += size) {
        const start = Math.max(0, i - overlap);
        const end = Math.min(text.length, i + size);
        const chunk = text.slice(start, end)
        chunks.push(chunk)
    }
    return chunks;

}

module.exports = chunkText;