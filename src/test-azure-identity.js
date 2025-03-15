"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var identity_1 = require("@azure/identity");
var azure_devops_node_api_1 = require("azure-devops-node-api");
var bearertoken_1 = require("azure-devops-node-api/handlers/bearertoken");
/**
 * Test Azure Identity authentication with Azure DevOps
 */
function testAzureIdentity() {
    return __awaiter(this, void 0, void 0, function () {
        var defaultCredential, cliCredential, chainedCredential, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    console.log('Testing Azure Identity authentication...');
                    // Test DefaultAzureCredential
                    console.log('Testing DefaultAzureCredential...');
                    defaultCredential = new identity_1.DefaultAzureCredential();
                    return [4 /*yield*/, testCredential('DefaultAzureCredential', defaultCredential)];
                case 1:
                    _a.sent();
                    // Test AzureCliCredential
                    console.log('Testing AzureCliCredential...');
                    cliCredential = new identity_1.AzureCliCredential();
                    return [4 /*yield*/, testCredential('AzureCliCredential', cliCredential)];
                case 2:
                    _a.sent();
                    // Test ChainedTokenCredential with AzureCliCredential as fallback
                    console.log('Testing ChainedTokenCredential...');
                    chainedCredential = new identity_1.ChainedTokenCredential(new identity_1.AzureCliCredential());
                    return [4 /*yield*/, testCredential('ChainedTokenCredential', chainedCredential)];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error('Error testing Azure Identity:', error_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Test a specific credential with Azure DevOps
 *
 * @param name The name of the credential
 * @param credential The credential to test
 */
function testCredential(name, credential) {
    return __awaiter(this, void 0, void 0, function () {
        var azureDevOpsResourceId, token, orgUrl, authHandler, connection, coreApi, projects, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    azureDevOpsResourceId = '499b84ac-1321-427f-aa17-267ca6975798';
                    return [4 /*yield*/, credential.getToken("".concat(azureDevOpsResourceId, "/.default"))];
                case 1:
                    token = _a.sent();
                    console.log("".concat(name, " token acquired:"), token ? 'Success' : 'Failed');
                    if (!token) return [3 /*break*/, 4];
                    orgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
                    if (!orgUrl) {
                        console.error('AZURE_DEVOPS_ORG_URL environment variable is required');
                        return [2 /*return*/];
                    }
                    console.log("Testing ".concat(name, " with Azure DevOps API..."));
                    authHandler = new bearertoken_1.BearerCredentialHandler(token.token);
                    connection = new azure_devops_node_api_1.WebApi(orgUrl, authHandler);
                    return [4 /*yield*/, connection.getCoreApi()];
                case 2:
                    coreApi = _a.sent();
                    return [4 /*yield*/, coreApi.getProjects()];
                case 3:
                    projects = _a.sent();
                    console.log("".concat(name, " connection successful. Found ").concat(projects.length, " projects."));
                    console.log('Projects:', projects.map(function (p) { return p.name; }).join(', '));
                    _a.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    error_2 = _a.sent();
                    console.error("Error testing ".concat(name, ":"), error_2);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// Run the test
testAzureIdentity().catch(console.error);
