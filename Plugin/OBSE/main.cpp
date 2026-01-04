#include "config.h"
#include "obse64/PluginAPI.h"
#include "obse64/GameConsole.h"
#include "obse64/GameData.h"
#include "obse64/GameForms.h"
#include <shlobj.h>
#include <Windows.h>
#include <cstdio>
#include <ctime>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>


PluginHandle g_pluginHandle = kPluginHandle_Invalid;

namespace
{
	constexpr DWORD kQuestLogIntervalMs = 45000;

	struct QuestProgressEntry
	{
		u32 formId;
		std::string name;
		u16 stage;
	};

	constexpr u32 kQuestStageOffset = 0xB8;

	const char* GetQuestName(TESForm* form)
	{
		const char* name = GetFullName(form);
		if (name && name[0] != '\0') {
			const char* prefix = "LOC_FN_";
			const size_t prefixLen = std::strlen(prefix);
			if (std::strncmp(name, prefix, prefixLen) == 0) {
				return name + prefixLen;
			}
			return name;
		}
		return "<unnamed>";
	}

	u16 GetQuestStage(const TESForm* form)
	{
		const u8* base = reinterpret_cast<const u8*>(form);
		return *reinterpret_cast<const u16*>(base + kQuestStageOffset);
	}

	std::string EscapeJson(const std::string& value)
	{
		std::string escaped;
		escaped.reserve(value.size());
		for (char ch : value) {
			switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped += ch;
				break;
			}
		}
		return escaped;
	}

	std::string BuildLogDirectory()
	{
		char documentsPath[MAX_PATH] = {};

		HRESULT hr = SHGetFolderPathA(
			nullptr,
			CSIDL_MYDOCUMENTS,
			nullptr,
			SHGFP_TYPE_CURRENT,
			documentsPath
		);

		if (FAILED(hr) || documentsPath[0] == '\0') {
			throw std::runtime_error(
				"OBRQuestCompanion: Failed to resolve Documents path"
			);
		}

		std::ostringstream path;
		path << documentsPath
			<< "\\My Games\\" << SAVE_FOLDER_NAME
			<< "\\OBSE\\OBRQuestCompanion";

		return path.str();
	}

	std::string BuildLogFilename()
	{
		return "quest_progress.json";
	}

	bool WriteQuestProgressLog(const std::vector<QuestProgressEntry>& entries)
	{
		if (entries.empty()) {
			return false;
		}

		std::string logDirectory;
		try {
			logDirectory = BuildLogDirectory();
		}
		catch (const std::exception& e) {
			_FATALERROR("%s", e.what());
			return false;
		}

		int dirResult = SHCreateDirectoryExA(
			nullptr,
			logDirectory.c_str(),
			nullptr
		);

		if (dirResult != ERROR_SUCCESS &&
			dirResult != ERROR_ALREADY_EXISTS) {
			_FATALERROR("Failed to create log directory");
			return false;
		}

		std::ofstream output(
			logDirectory + "\\" + BuildLogFilename(),
			std::ios::out | std::ios::trunc
		);

		if (!output.is_open()) {
			_FATALERROR("Failed to open quest progress log file");
			return false;
		}

		std::time_t now = std::time(nullptr);
		std::tm utcTime = {};
		gmtime_s(&utcTime, &now);

		char timeBuffer[32] = {};
		std::snprintf(timeBuffer, sizeof(timeBuffer), "%04d-%02d-%02d %02d:%02d:%02d",
			utcTime.tm_year + 1900,
			utcTime.tm_mon + 1,
			utcTime.tm_mday,
			utcTime.tm_hour,
			utcTime.tm_min,
			utcTime.tm_sec);

		output << "{\n";
		output << "  \"generated_at_utc\": \"" << timeBuffer << "\",\n";
		output << "  \"quest_count\": " << entries.size() << ",\n";
		output << "  \"quests\": [\n";

		for (size_t index = 0; index < entries.size(); ++index) {
			const QuestProgressEntry& entry = entries[index];
			std::ostringstream formId;
			formId << "0x" << std::uppercase << std::hex << std::setw(8) << std::setfill('0') << entry.formId;

			output << "    {\n";
			output << "      \"form_id\": \"" << formId.str() << "\",\n";
			output << "      \"name\": \"" << EscapeJson(entry.name) << "\",\n";
			output << "      \"stage\": " << entry.stage << "\n";
			output << "    }";
			if (index + 1 < entries.size()) {
				output << ",";
			}
			output << "\n";
		}

		output << "  ]\n";
		output << "}\n";

		return true;
	}

	void CollectQuestProgress(std::vector<QuestProgressEntry>& entries)
	{
		TESDataHandler* dataHandler = TESDataHandler::GetSingleton();
		if (!dataHandler) {
			return;
		}

		for (u32 formId = 1; formId < dataHandler->nextFormID; ++formId) {
			TESForm* form = LookupFormByID(formId);
			if (!form) {
				continue;
			}

			if (form->typeID != kFormType_Quest) {
				continue;
			}

			QuestProgressEntry entry{};
			entry.formId = form->refID;
			entry.name = GetQuestName(form);
			entry.stage = GetQuestStage(form);
			entries.push_back(entry);
		}
	}

	DWORD WINAPI QuestProgressLogThread(LPVOID)
	{
		SetThreadDescription(GetCurrentThread(), L"OBRQuestCompanionThread");

		for (;;) {
			std::vector<QuestProgressEntry> entries;
			CollectQuestProgress(entries);
			WriteQuestProgressLog(entries);
			Sleep(kQuestLogIntervalMs);
		}

		return 0;
	}

	void StartQuestProgressLogging()
	{
		HANDLE threadHandle = CreateThread(nullptr, 0, QuestProgressLogThread, nullptr, 0, nullptr);
		if (!threadHandle) {
			return;
		}

		SetThreadDescription(threadHandle, L"OBRQuestCompanionThread");
		CloseHandle(threadHandle);
	}
}

const bool IsCompatible(const OBSEInterface* obse)
{
	if (!IVersionCheck::IsCompatibleVersion(obse->runtimeVersion, MINIMUM_RUNTIME_VERSION, SUPPORTED_RUNTIME_VERSION, SUPPORTED_RUNTIME_VERSION_STRICT)) {
		_FATALERROR("ERROR::IsCompatible: Plugin is not compatible with runtime version, disabling");
		return false;
	}

	return true;
}

extern "C" {

	__declspec(dllexport) OBSEPluginVersionData OBSEPlugin_Version =
	{
		OBSEPluginVersionData::kVersion,

		PLUGIN_VERSION_DLL,
		PLUGIN_NAME_LONG,
		PLUGIN_AUTHOR,
		0,
		0,
		{ SUPPORTED_RUNTIME_VERSION, 0 },
		0,
		0, 0, 0
	};

	bool OBSEPlugin_Load(const OBSEInterface* obse)
	{
		if (!IsCompatible(obse)) {
			_FATALERROR("ERROR::OBRQuestCompanion: Incompatible | Disabling Plugin");
			return false;
		}

		g_pluginHandle = obse->GetPluginHandle();

		StartQuestProgressLogging();
		return true;
	}

};
