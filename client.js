document.getElementById("downloadBtn").addEventListener("click", startDownload);

async function startDownload() {
    const urlInput = document.getElementById("urlInput").value.trim();
    if (!urlInput) return alert("Please enter a valid GitHub URL");

    const ui = setupUI();

    try {
        const repoInfo = parseGithubUrl(urlInput);
        if (!repoInfo) throw new Error("Invalid GitHub URL format.");

        ui.updateStatus("Fetching repository structure...");
        const treeUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${repoInfo.branch}?recursive=1`;

        const treeResponse = await fetch(treeUrl);
        if (!treeResponse.ok)
            throw new Error(`GitHub API Error: ${treeResponse.statusText}`);

        const treeData = await treeResponse.json();

        // Filter out only the files that belong to the requested directory path
        const filesToDownload = treeData.tree.filter(
            (item) =>
                item.type === "blob" && item.path.startsWith(repoInfo.path),
        );

        if (filesToDownload.length === 0)
            throw new Error("No files found in that directory.");
        if (filesToDownload.length > 1000)
            throw new Error("Directory too large (over 1000 files).");

        ui.updateStatus(
            `Found ${filesToDownload.length} files. Starting download...`,
        );

        const zip = new JSZip();
        let completed = 0;

        // Chunking function to prevent browser freezing and network saturation
        const chunkSize = 5;
        for (let i = 0; i < filesToDownload.length; i += chunkSize) {
            const chunk = filesToDownload.slice(i, i + chunkSize);

            await Promise.all(
                chunk.map(async (file) => {
                    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${file.path}`;
                    const fileRes = await fetch(rawUrl);
                    if (!fileRes.ok)
                        throw new Error(`Failed to fetch ${file.path}`);

                    // Fetch as arrayBuffer to preserve binary data (images, fonts, etc.)
                    const blob = await fileRes.arrayBuffer();

                    // Strip the base directory path so the zip structure is clean
                    const zipPath = file.path
                        .substring(repoInfo.path.length)
                        .replace(/^\//, "");
                    zip.file(zipPath, blob);

                    completed++;
                    ui.updateProgress(completed, filesToDownload.length);
                }),
            );
        }

        ui.updateStatus("Compressing files into ZIP...");
        const zipBlob = await zip.generateAsync({ type: "blob" });

        ui.updateStatus("Download complete!");
        triggerDownload(
            zipBlob,
            `${repoInfo.repo}-${repoInfo.path.split("/").pop() || "download"}.zip`,
        );
    } catch (error) {
        ui.updateStatus(`Error: ${error.message}`);
        console.error(error);
    } finally {
        ui.finish();
    }
}

function parseGithubUrl(url) {
    // Basic regex to extract owner, repo, and the rest of the path
    const match = url.match(
        /github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)\/(.*))?/,
    );
    if (!match) return null;

    return {
        owner: match[1],
        repo: match[2],
        // Default to 'main' if no branch is specified in URL
        branch: match[3] || "main",
        // Default to root string if no path is specified
        path: match[4]
            ? match[4].endsWith("/")
                ? match[4]
                : match[4] + "/"
            : "",
    };
}

function triggerDownload(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function setupUI() {
    const btn = document.getElementById("downloadBtn");
    const statusArea = document.getElementById("statusArea");
    const statusText = document.getElementById("statusText");
    const progressBar = document.getElementById("progressBar");

    btn.disabled = true;
    statusArea.classList.remove("status-hidden");
    progressBar.style.width = "0%";

    return {
        updateStatus: (text) => {
            statusText.innerText = text;
        },
        updateProgress: (completed, total) => {
            const percent = (completed / total) * 100;
            progressBar.style.width = `${percent}%`;
            statusText.innerText = `Downloading: ${completed} / ${total} files`;
        },
        finish: () => {
            btn.disabled = false;
        },
    };
}
