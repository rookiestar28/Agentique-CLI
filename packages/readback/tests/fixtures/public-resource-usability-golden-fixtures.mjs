export const publicResourceUsabilityGoldenFixtureVersion = "agentique.publicResourceUsabilityGolden.v1";

export const publicResourceUsabilityValidFixture = Object.freeze({
  id: "valid-source-package",
  resourceId: "agent.research.alpha",
  expected: Object.freeze({
    availability: "available",
    downloadKind: "ticketed-post",
    method: "POST",
    filename: "research-alpha.agentique.zip",
    mediaType: "application/zip",
    sizeBytes: 4096,
    digest: "a".repeat(64)
  }),
  sourcePackage: Object.freeze({
    platformId: "source-package",
    artifactKind: "source-package",
    status: "DOWNLOADABLE",
    method: "POST",
    downloadEndpoint: "/api/public/v1/resources/agent.research.alpha/download",
    file: Object.freeze({
      fileName: "research-alpha.agentique.zip",
      contentType: "application/zip",
      byteSize: 4096,
      checksumSha256: "a".repeat(64)
    })
  })
});

export const publicResourceUsabilityInvalidFixtures = Object.freeze([
  Object.freeze({
    id: "metadata-only-overclaim",
    expectedReason: "source_package_not_downloadable",
    sourcePackage: Object.freeze({
      ...publicResourceUsabilityValidFixture.sourcePackage,
      status: "METADATA_ONLY",
      downloadEndpoint: null,
      unavailableReason: "source_package_not_downloadable"
    })
  }),
  Object.freeze({
    id: "missing-checksum",
    expectedReason: "source_file_checksum_missing",
    sourcePackage: Object.freeze({
      ...publicResourceUsabilityValidFixture.sourcePackage,
      file: Object.freeze({
        fileName: "research-alpha.agentique.zip",
        contentType: "application/zip",
        byteSize: 4096
      })
    })
  }),
  Object.freeze({
    id: "unsupported-method",
    expectedReason: "download_method_unsupported",
    sourcePackage: Object.freeze({
      ...publicResourceUsabilityValidFixture.sourcePackage,
      method: "GET"
    })
  }),
  Object.freeze({
    id: "missing-endpoint",
    expectedReason: "download_endpoint_missing",
    sourcePackage: Object.freeze({
      ...publicResourceUsabilityValidFixture.sourcePackage,
      downloadEndpoint: null
    })
  }),
  Object.freeze({
    id: "unsafe-filename",
    expectedReason: "source_file_name_invalid",
    sourcePackage: Object.freeze({
      ...publicResourceUsabilityValidFixture.sourcePackage,
      file: Object.freeze({
        ...publicResourceUsabilityValidFixture.sourcePackage.file,
        fileName: "../research-alpha.agentique.zip"
      })
    })
  }),
  Object.freeze({
    id: "placeholder-public-text",
    expectedReason: "source_package_public_text_unsupported",
    sourcePackage: Object.freeze({
      ...publicResourceUsabilityValidFixture.sourcePackage,
      file: Object.freeze({
        ...publicResourceUsabilityValidFixture.sourcePackage.file,
        fileName: "schema-only-source-index-package.zip"
      })
    })
  })
]);

export function makeDownloadMetadataFixture(sourcePackage, resourceId = publicResourceUsabilityValidFixture.resourceId) {
  return {
    ok: true,
    availability: "available",
    data: {
      resourceId,
      method: "POST",
      downloadEndpoint: `/api/public/v1/resources/${resourceId}/legacy-download`,
      files: [
        {
          fileName: "legacy-overclaim.agentique.zip",
          contentType: "application/zip",
          byteSize: 4096,
          checksumSha256: "b".repeat(64)
        }
      ],
      sourcePackage
    }
  };
}
