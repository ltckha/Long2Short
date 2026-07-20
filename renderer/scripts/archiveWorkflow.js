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
  deleteIncomingInputVideo(workflow.inputVideo, workflow.incomingDir, workflow.projectId, log);

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
  log(`Render lỗi, dọn dẹp dự án=${workflow.projectId} dir=${projectDir}`);
  fs.mkdirSync(projectDir, { recursive: true });

  deleteIncomingInputVideo(workflow.inputVideo, workflow.incomingDir, workflow.projectId, log);
  moveFile(workflow.timelinePath, projectDir, log);

  // Xóa WAV voice files khỏi incoming khi render thất bại
  moveVoiceWavFiles(workflow.incomingDir, workflow.projectId, projectDir, log);
}

function deleteIncomingInputVideo(inputVideo, incomingDir, projectId, log) {
  try {
    const tempVideoPath = inputVideo || path.join(incomingDir, `${projectId}.mp4`);
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      const relative = path.relative(incomingDir, tempVideoPath);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        fs.rmSync(tempVideoPath, { force: true });
        log(`[Cleanup] Đã xóa file video copy tạm trong incoming: ${tempVideoPath}`);
      }
    }
  } catch (err) {
    log(`[Cleanup] WARN: Không thể xóa file video tạm trong incoming: ${err.message}`);
  }
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
