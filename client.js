document.getElementById("urlInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startDownload();
});
document.getElementById("tokenInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startDownload();
});

document.getElementById("copyLogBtn").addEventListener("click", async (e) => {
    const logItems = Array.from(document.getElementById("logList").children);
    if (logItems.length === 0) return;

    const textToCopy = logItems.map((li) => li.innerText).join("\n");
    try {
        await navigator.clipboard.writeText(textToCopy);
        e.target.innerText = "Copied!";
        e.target.style.backgroundColor = "#4CAF50";
        e.target.style.color = "#fff";
        setTimeout(() => {
            e.target.innerText = "Copy";
            e.target.style.backgroundColor = "";
            e.target.style.color = "";
        }, 2000);
    } catch (err) {
        console.error("Failed to copy: ", err);
    }
});

async function startDownload() {
    const urlInput = document.getElementById("urlInput").value.trim();
    if (!urlInput) return alert("Please enter a valid GitHub URL");

    const repoInfo = parseGithubUrl(urlInput);
    if (!repoInfo) return alert("Invalid GitHub URL format.");

    const ui = setupUI(repoInfo);

    try {
        const token = document.getElementById("tokenInput").value.trim();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const treeUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${repoInfo.branch}?recursive=1`;
        const treeResponse = await fetch(treeUrl, { headers });

        if (!treeResponse.ok) {
            if (treeResponse.status === 403 || treeResponse.status === 429) {
                throw new Error(
                    "GitHub API rate limit exceeded. Add a Personal Access Token to continue.",
                );
            }
            throw new Error(`GitHub API Error: ${treeResponse.statusText}`);
        }

        const treeData = await treeResponse.json();

        const filesToDownload = treeData.tree.filter(
            (item) =>
                item.type === "blob" && item.path.startsWith(repoInfo.path),
        );

        if (filesToDownload.length === 0)
            throw new Error("No files found in that directory.");
        if (filesToDownload.length > 5000) {
            console.warn(
                "Downloading a massive directory. The browser might freeze during zipping.",
            );
        }

        ui.updateFileCount(`Downloading: 1 / ${filesToDownload.length} files`);

        const zip = new JSZip();
        let completed = 0;
        let hasError = false;
        const chunkSize = 5;

        for (let i = 0; i < filesToDownload.length; i += chunkSize) {
            if (hasError) break;
            const chunk = filesToDownload.slice(i, i + chunkSize);

            await Promise.all(
                chunk.map(async (file) => {
                    if (hasError) return;

                    ui.updateCurrentFile(file.path);

                    const encodedPath = file.path
                        .split("/")
                        .map(encodeURIComponent)
                        .join("/");
                    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${encodedPath}`;

                    const fileRes = await fetch(rawUrl);
                    if (!fileRes.ok) {
                        hasError = true;
                        throw new Error(
                            `Failed to fetch ${file.path} (HTTP ${fileRes.status})`,
                        );
                    }

                    const blob = await fileRes.arrayBuffer();

                    if (hasError) return;

                    const zipPath = file.path
                        .substring(repoInfo.path.length)
                        .replace(/^\//, "");
                    zip.file(zipPath, blob);

                    completed++;
                    ui.addLog(file.path);
                    ui.updateProgress(completed, filesToDownload.length);
                }),
            );
        }

        ui.updateFileCount(`Downloaded: ${filesToDownload.length} files`);
        ui.updateCurrentFile("Zipping files...");

        const zipBlob = await zip.generateAsync({ type: "blob" });

        ui.updateCurrentFile("Zipping done!");

        triggerDownload(
            zipBlob,
            `${repoInfo.repo}-${repoInfo.path.split("/").pop() || "download"}.zip`,
        );
    } catch (error) {
        ui.updateCurrentFile(`Error: ${error.message}`);
        console.error(error);
    } finally {
        ui.finish();
    }
}

function parseGithubUrl(url) {
    const match = url.match(
        /github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)\/(.*))?/,
    );
    if (!match) return null;
    return {
        owner: match[1],
        repo: match[2],
        branch: match[3] || "main",
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

function setupUI(repoInfo) {
    const urlInput = document.getElementById("urlInput");
    const tokenInput = document.getElementById("tokenInput");
    const statusArea = document.getElementById("statusArea");
    const repoTitle = document.getElementById("repoTitle");
    const fileCountText = document.getElementById("fileCountText");
    const currentFileText = document.getElementById("currentFileText");
    const progressBar = document.getElementById("progressBar");
    const logList = document.getElementById("logList");

    urlInput.disabled = true;
    tokenInput.disabled = true;
    statusArea.classList.remove("status-hidden");
    document.getElementById("logContainer").classList.add("status-hidden");
    progressBar.style.width = "0%";
    logList.innerHTML = "";

    repoTitle.innerText = `Repo: ${repoInfo.owner}/${repoInfo.repo}`;
    fileCountText.innerText = "Retrieving directory info...";
    currentFileText.innerText = "\u00A0";

    return {
        updateFileCount: (text) => {
            fileCountText.innerText = text;
        },
        updateCurrentFile: (text) => {
            currentFileText.innerText = text;
        },
        addLog: (text) => {
            document
                .getElementById("logContainer")
                .classList.remove("status-hidden");

            const li = document.createElement("li");
            li.innerText = text;
            logList.prepend(li);
        },
        updateProgress: (completed, total) => {
            const percent = (completed / total) * 100;
            progressBar.style.width = `${percent}%`;
            fileCountText.innerText = `Downloading: ${Math.min(completed + 1, total)} / ${total} files`;
        },
        finish: () => {
            urlInput.disabled = false;
            tokenInput.disabled = false;
        },
    };
}
