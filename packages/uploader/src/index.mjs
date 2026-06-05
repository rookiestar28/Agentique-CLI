export const UPLOADER_PACKAGE_BOUNDARY = Object.freeze({
  packageName: "@agentique.io/uploader",
  version: "0.1.0",
  commandName: "agentique",
  status: "boundary-only",
  submissionMode: "review-only",
  liveUploadAvailable: false,
  mutatingPackage: true,
  forbiddenClaims: Object.freeze([
    "publication",
    "approval",
    "certification",
    "safety-certification",
    "hosted-execution",
    "moderation-outcome"
  ])
});

export const UPLOADER_PACKAGE_VERSION = UPLOADER_PACKAGE_BOUNDARY.version;

export function createUploaderBoundaryStatus() {
  return {
    ok: false,
    code: "uploader.boundary_only",
    message:
      "The Agentique uploader package boundary is present, but live upload commands are not enabled in this release.",
    boundary: {
      packageName: UPLOADER_PACKAGE_BOUNDARY.packageName,
      version: UPLOADER_PACKAGE_BOUNDARY.version,
      commandName: UPLOADER_PACKAGE_BOUNDARY.commandName,
      submissionMode: UPLOADER_PACKAGE_BOUNDARY.submissionMode,
      liveUploadAvailable: UPLOADER_PACKAGE_BOUNDARY.liveUploadAvailable
    }
  };
}
