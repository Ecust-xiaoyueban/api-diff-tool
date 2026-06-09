import asyncio
import json
import os
import difflib
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import httpx
from deepdiff import DeepDiff
import uvicorn

app = FastAPI(title="API Diff Tool (Pro Edition)")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

WORKSPACE_DIR = "workspaces"
os.makedirs(WORKSPACE_DIR, exist_ok=True)


class CompareRequest(BaseModel):
    old_prefix: str
    new_prefix: str
    uri: str
    method: str = "POST"
    # 🌟 变更为独立的 Header 以支持差异化鉴权
    old_headers: str = "{}"
    new_headers: str = "{}"
    payload: str
    payload_new: str = ""
    is_diff_payload: bool = False
    ignore_paths: str
    case_ignore_paths: str = ""


@app.get("/")
async def serve_ui(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/groups")
async def get_groups():
    groups = []
    for filename in os.listdir(WORKSPACE_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(WORKSPACE_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    groups.append({"id": data.get("id"), "name": data.get("name")})
            except Exception:
                continue
    return sorted(groups, key=lambda x: x["id"])


@app.get("/api/workspace/{group_id}")
async def get_workspace(group_id: str):
    filepath = os.path.join(WORKSPACE_DIR, f"{group_id}.json")
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


@app.post("/api/workspace/{group_id}")
async def save_workspace(group_id: str, data: dict):
    filepath = os.path.join(WORKSPACE_DIR, f"{group_id}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "success"}


@app.post("/api/compare")
async def compare_api(req: CompareRequest):
    try:
        # 🌟 分别解析老系统和新系统的 Headers
        headers_old_dict = json.loads(req.old_headers) if req.old_headers.strip() else {}
        headers_new_dict = json.loads(req.new_headers) if req.new_headers.strip() else {}

        payload_old_dict = json.loads(req.payload) if req.payload.strip() else {}
        if req.is_diff_payload:
            payload_new_dict = json.loads(req.payload_new) if req.payload_new.strip() else {}
        else:
            payload_new_dict = payload_old_dict

        exclude_paths = []
        if req.ignore_paths.strip():
            exclude_paths.extend([path.strip() for path in req.ignore_paths.split(",")])
        if req.case_ignore_paths.strip():
            exclude_paths.extend([path.strip() for path in req.case_ignore_paths.split(",")])

        old_url = req.old_prefix.rstrip("/") + "/" + req.uri.lstrip("/")
        new_url = req.new_prefix.rstrip("/") + "/" + req.uri.lstrip("/")

        async with httpx.AsyncClient(timeout=15.0) as client:
            # 🌟 携带各自的鉴权 Headers 发起并发请求
            old_task = client.request(req.method, old_url, headers=headers_old_dict, json=payload_old_dict)
            new_task = client.request(req.method, new_url, headers=headers_new_dict, json=payload_new_dict)

            results = await asyncio.gather(old_task, new_task, return_exceptions=True)
            old_res, new_res = results[0], results[1]

            old_data = old_res.json() if isinstance(old_res, httpx.Response) and old_res.status_code == 200 else str(
                old_res)
            new_data = new_res.json() if isinstance(new_res, httpx.Response) and new_res.status_code == 200 else str(
                new_res)

            diff = DeepDiff(old_data, new_data, exclude_paths=exclude_paths, ignore_order=True)

            old_json_str = json.dumps(old_data, indent=2, ensure_ascii=False) if isinstance(old_data,
                                                                                            (dict, list)) else str(
                old_data)
            new_json_str = json.dumps(new_data, indent=2, ensure_ascii=False) if isinstance(new_data,
                                                                                            (dict, list)) else str(
                new_data)
            ndiff_lines = list(difflib.ndiff(old_json_str.splitlines(), new_json_str.splitlines()))

            return {
                "status": "success",
                "old_url": old_url,
                "new_url": new_url,
                "text_diff": ndiff_lines,
                "diff_result": json.loads(diff.to_json()) if diff else "✅ 完全一致 (已排除忽略字段)"
            }

    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000)