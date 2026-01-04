local function NormalizePath(path)
    path = path:gsub("/", "\\")
    path = path:gsub("\\\\+", "\\")
    return path
end

local UEHelpers = require('UEHelpers')

local docsPath = NormalizePath(os.getenv("USERPROFILE") .. "\\Documents\\My Games\\Oblivion Remastered\\OBSE\\OBRQuestCompanion")
local questJsonPath = docsPath .. "\\quest_progress.json"
	
local function GetQuestStages()
    local result = ExecuteConsoleCommand("sq")
    if not result or not result:match("Stage%s*%d+") then
        return nil, "ExecuteConsoleCommand failed to get quest stages"
    end

    local quests = {}

    for rawName, stage in result:gmatch("(.-)%-%-%s*Stage%s*(%d+)") do
        stage = tonumber(stage)
        if stage and stage > 0 then
            local name = rawName
                :gsub("%s*%(%s*On%s*%)", "")
                :gsub("%s*%(%s*Off%s*%)", "")
                :gsub("^%s+", "")
                :gsub("%s+$", "")

            if #name > 0 then
                quests[#quests + 1] = { name = name, stage = stage }
            end
        end
    end

    return quests
end

local function WriteQuestsToJson(path, quests)
    if type(quests) ~= "table" then
        return false
    end

    local function jsonEscape(str)
		return str:gsub('[%z\1-\31\\"]', function(c)
			if c == "\\" then return "\\\\"
			elseif c == "\"" then return "\\\""
			elseif c == "\n" then return "\\n"
			elseif c == "\r" then return "\\r"
			elseif c == "\t" then return "\\t"
			elseif c == "\b" then return "\\b"
			elseif c == "\f" then return "\\f"
			else
				return string.format("\\u%04X", c:byte())
			end
		end)
	end

    local generatedAtUtc = os.date("!%Y-%m-%d %H:%M:%S")
	
	local file, openErr = io.open(path, "w")
    if not file then
        return false, ("io.open failed: " .. tostring(openErr))
    end

    file:write("{\n")
    file:write(string.format(
        '  "generated_at_utc": "%s",\n',
        generatedAtUtc
    ))
    file:write(string.format(
        '  "quest_count": %d,\n',
        #quests
    ))
    file:write('  "quests": [\n')

    for i, quest in ipairs(quests) do
        file:write("    {\n")
        file:write(string.format(
            '      "name": "%s",\n',
            jsonEscape(quest.name)
        ))
        file:write(string.format(
            '      "stage": %d\n',
            quest.stage
        ))
        file:write("    }")

        if i < #quests then
            file:write(",")
        end
        file:write("\n")
    end

    file:write("  ]\n")
    file:write("}\n")

    file:close()
    return true
end

local function DumpQuestProgress()
    ExecuteInGameThread(function()
       local quests, err = GetQuestStages()
		if not quests then
			print("OBRQuestCompanion: " .. err)
			return
		end
		
		local ok, writeErr = WriteQuestsToJson(questJsonPath, quests)
        if not ok then
			print("OBRQuestCompanion: JSON write failed: " .. tostring(writeErr))
		end
    end)
end

local function EnsureQuestJsonExists()
    local f = io.open(questJsonPath, "r")
    if f then
        f:close()
        return
    end
	
	local dir = questJsonPath:match("^(.*)[/\\][^/\\]+$")
    if not dir then return end

    os.execute(string.format('mkdir "%s"', dir))
	
	WriteQuestsToJson(questJsonPath, {})
end

EnsureQuestJsonExists()

RegisterHook("/Script/Altar.VAltarTelemetrySubsystem:OnSaveComplete", function()
	DumpQuestProgress()
end)