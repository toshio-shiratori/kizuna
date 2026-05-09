import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export interface EndpointInfo {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParameterInfo[];
  requestBody?: RequestBodyInfo;
  responses: ResponseInfo[];
}

export interface ParameterInfo {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  type?: string;
}

export interface RequestBodyInfo {
  required: boolean;
  description?: string;
  schemaRef?: string;
  properties: PropertyInfo[];
}

export interface PropertyInfo {
  name: string;
  type?: string;
  description?: string;
  required: boolean;
}

export interface ResponseInfo {
  status: string;
  description?: string;
  schemaRef?: string;
}

interface OpenAPISpec {
  paths?: Record<string, Record<string, OpenAPIOperation>>;
  components?: { schemas?: Record<string, OpenAPISchema> };
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
}

interface OpenAPIParameter {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: OpenAPISchema;
}

interface OpenAPIRequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, { schema?: OpenAPISchema }>;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<string, { schema?: OpenAPISchema }>;
}

interface OpenAPISchema {
  type?: string;
  $ref?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
}

export function loadSpec(specPath: string): OpenAPISpec {
  const content = readFileSync(specPath, "utf-8");
  if (specPath.endsWith(".json")) {
    return JSON.parse(content) as OpenAPISpec;
  }
  return parseYaml(content) as OpenAPISpec;
}

export function parseEndpoints(spec: OpenAPISpec): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  if (!spec.paths) return endpoints;

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === "parameters" || method.startsWith("x-")) continue;
      endpoints.push(parseOperation(path, method, operation, spec));
    }
  }

  return endpoints;
}

function parseOperation(
  path: string,
  method: string,
  op: OpenAPIOperation,
  spec: OpenAPISpec,
): EndpointInfo {
  const parameters: ParameterInfo[] = (op.parameters ?? []).map((p) => ({
    name: p.name ?? "",
    in: p.in ?? "",
    required: p.required ?? false,
    description: p.description,
    type: p.schema?.type,
  }));

  let requestBody: RequestBodyInfo | undefined;
  if (op.requestBody) {
    const jsonContent = op.requestBody.content?.["application/json"];
    const schema = jsonContent?.schema;
    const resolved = schema ? resolveSchema(schema, spec) : undefined;

    requestBody = {
      required: op.requestBody.required ?? false,
      description: op.requestBody.description,
      schemaRef: schema?.$ref,
      properties: resolved ? extractProperties(resolved) : [],
    };
  }

  const responses: ResponseInfo[] = Object.entries(op.responses ?? {}).map(([status, resp]) => {
    const jsonContent = resp.content?.["application/json"];
    return {
      status,
      description: resp.description,
      schemaRef: jsonContent?.schema?.$ref,
    };
  });

  return {
    path,
    method: method.toUpperCase(),
    operationId: op.operationId,
    summary: op.summary,
    description: op.description,
    tags: op.tags ?? [],
    parameters,
    requestBody,
    responses,
  };
}

function resolveSchema(schema: OpenAPISchema, spec: OpenAPISpec): OpenAPISchema | undefined {
  if (schema.$ref) {
    const refPath = schema.$ref.replace("#/components/schemas/", "");
    return spec.components?.schemas?.[refPath];
  }
  return schema;
}

function extractProperties(schema: OpenAPISchema): PropertyInfo[] {
  if (!schema.properties) return [];
  const requiredSet = new Set(schema.required ?? []);

  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: prop.type ?? (prop.$ref ? "object" : undefined),
    description: prop.description,
    required: requiredSet.has(name),
  }));
}
