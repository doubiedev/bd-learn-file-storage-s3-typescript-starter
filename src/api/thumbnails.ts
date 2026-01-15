import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "node:path";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
    const { videoId } = req.params as { videoId?: string };
    if (!videoId) {
        throw new BadRequestError("Invalid video ID");
    }

    const token = getBearerToken(req.headers);
    const userID = validateJWT(token, cfg.jwtSecret);

    const video = getVideo(cfg.db, videoId);
    if (!video) {
        throw new NotFoundError("Couldn't find video");
    }
    if (video.userID !== userID) {
        throw new UserForbiddenError("Not authorized to update this video");
    }

    const formData = await req.formData();
    const file = formData.get("thumbnail");
    if (!(file instanceof File)) {
        throw new BadRequestError("Thumbnail file missing");
    }

    const MAX_UPLOAD_SIZE = 10 << 20;

    if (file.size > MAX_UPLOAD_SIZE) {
        throw new BadRequestError(
            `Thumbnail file exceeds the maximum allowed size of 10MB`,
        );
    }

    const mediaType = file.type;
    if (!mediaType) {
        throw new BadRequestError("Missing Content-Type for thumbnail");
    }
    if (!mediaType.includes("image")) {
        throw new BadRequestError("Invalid files type");
    }

    const fileData = await file.arrayBuffer();
    if (!fileData) {
        throw new Error("Error reading file data");
    }

    const fileType = mediaType.split("/")[1];
    const filePath = path.join(cfg.assetsRoot, videoId) + `.${fileType}`;
    await Bun.write(filePath, fileData);

    video.thumbnailURL = `http://localhost:${cfg.port}/${filePath}`;
    updateVideo(cfg.db, video);

    return respondWithJSON(200, video);
}
