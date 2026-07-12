const fs = require("fs");
const path = require("path");
const { buildPostText } = require("./captionGenerator");

function createWorkflowContext(options) {
  return {
    enabled: options.enabled,
    projectId: options.projectId,
    incomingDir: options.incomingDir,
    renderedDir: options.renderedDir,
    archiveDir: options.archiveDir,
    failedDir: options.failedDir,
    timelinePath: options.timelinePath,
    inputVideo: null,
    outputPath: null,
    timeline: null,
  };
}

function archiveSuccessfulRender(workflow, log) {
  if (!workflow.enabled) return;

  const projectDir = path.join(workflow.archiveDir, workflow.projectId);
  log(`Archive project=${workflow.projectId} dir=${projectDir}`);
  fs.mkdirSync(projectDir, { recursive: true });

  moveFile(workflow.timelinePath, projectDir, log);
  moveFile(workflow.outputPath, projectDir, log);
  moveFile(workflow.inputVideo, workflow.renderedDir, log);

  // Di chuyển toàn bộ WAV voice files vào archive
  moveVoiceWavFiles(workflow.incomingDir, workflow.projectId, projectDir, log);

  const postPath = path.join(projectDir, "post.txt");
  fs.writeFileSync(postPath, buildPostText(workflow.timeline || {}), "utf8");
  log(`Tạo post.txt thành công: ${postPath}`);
  log(`Moved to archive: project=${workflow.projectId} dir=${projectDir}`);
}

function archiveFailedRender(workflow, log) {
  if (!workflow.enabled) return;

  const projectDir = path.join(workflow.failedDir, workflow.projectId);
  log(`Render lỗi, move source sang failed project=${workflow.projectId} dir=${projectDir}`);
  fs.mkdirSync(projectDir, { recursive: true });

  moveFile(
    workflow.inputVideo || path.join(workflow.incomingDir, `${workflow.projectId}.mp4`),
    projectDir,
    log
  );
  moveFile(workflow.timelinePath, projectDir, log);

  // Xóa WAV voice files khỏi incoming khi render thất bại
  moveVoiceWavFiles(workflow.incomingDir, workflow.projectId, projectDir, log);
}

function moveVoiceWavFiles(incomingDir, projectId, targetDir, log) {
  try {
    const files = fs.readdirSync(incomingDir);
    const wavFiles = files.filter(
      (f) => f.startsWith(`${projectId}_`) && f.endsWith(".wav")
    );
    for (const wavFile of wavFiles) {
      moveFile(path.join(incomingDir, wavFile), targetDir, log);
    }
  } catch {
    // Không block workflow nếu lỗi quét WAV
  }
}

function moveFile(sourcePath, targetDir, log) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;

  fs.mkdirSync(targetDir, { recursive: true });
  const destinationPath = path.join(targetDir, path.basename(sourcePath));

  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    return destinationPath;
  }

  if (fs.existsSync(destinationPath)) {
    fs.rmSync(destinationPath, { force: true });
  }

  fs.renameSync(sourcePath, destinationPath);
  log(`Move file: ${sourcePath} -> ${destinationPath}`);
  return destinationPath;
}

module.exports = {
  archiveFailedRender,
  archiveSuccessfulRender,
  createWorkflowContext,
};
