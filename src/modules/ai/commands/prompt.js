const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../../../core/logger');
const config = require('../../../core/config');
const { service } = require('../index');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aiprompt')
    .setDescription('管理AI提示詞設定')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('查看當前的AI提示詞')
        .addStringOption(option =>
          option
            .setName('department')
            .setDescription('選擇部門')
            .setRequired(false)
            .addChoices(
              ...config.departments.map(dept => ({ name: dept.name, value: dept.id })),
              { name: '預設提示詞', value: 'default' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('編輯AI提示詞')
        .addStringOption(option =>
          option
            .setName('department')
            .setDescription('選擇部門')
            .setRequired(false)
            .addChoices(
              ...config.departments.map(dept => ({ name: dept.name, value: dept.id })),
              { name: '預設提示詞', value: 'default' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('savetofile')
        .setDescription('將當前提示詞儲存至檔案')
        .addStringOption(option =>
          option
            .setName('department')
            .setDescription('選擇部門')
            .setRequired(false)
            .addChoices(
              ...config.departments.map(dept => ({ name: dept.name, value: dept.id })),
              { name: '預設提示詞', value: 'default' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('loadfromfile')
        .setDescription('從檔案載入提示詞')
        .addStringOption(option =>
          option
            .setName('department')
            .setDescription('選擇部門')
            .setRequired(false)
            .addChoices(
              ...config.departments.map(dept => ({ name: dept.name, value: dept.id })),
              { name: '預設提示詞', value: 'default' }
            )
        )
    ),
    
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'view') {
      await handleViewPrompt(interaction);
    } else if (subcommand === 'edit') {
      await handleEditPrompt(interaction);
    } else if (subcommand === 'savetofile') {
      await handleSaveToFile(interaction);
    } else if (subcommand === 'loadfromfile') {
      await handleLoadFromFile(interaction);
    }
  }
};

/**
 * Handle view prompt subcommand
 * @param {Interaction} interaction - The command interaction
 */
async function handleViewPrompt(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const departmentOption = interaction.options.getString('department');
    const departmentId = departmentOption === 'default' ? null : departmentOption;
    
    // Get the prompt from the database
    const prompt = await service.getPrompt(departmentId);
    
    if (!prompt) {
      const defaultPrompt = departmentId 
        ? config.ai.departmentPrompts[departmentId] || config.ai.defaultPrompt 
        : config.ai.defaultPrompt;
        
      await interaction.editReply({
        content: `找不到儲存的提示詞，使用配置文件中的預設提示詞：\n\`\`\`\n${defaultPrompt}\n\`\`\``
      });
      return;
    }
    
    // Format the department name
    let deptName = '預設';
    if (departmentId) {
      const dept = config.departments.find(d => d.id === departmentId);
      if (dept) deptName = dept.name;
    }
    
    // Show prompt source
    const source = prompt.source ? ` (來源: ${prompt.source})` : '';
    
    await interaction.editReply({
      content: `${deptName}部門的AI提示詞${source}：\n\`\`\`\n${prompt.promptText}\n\`\`\``
    });
  } catch (error) {
    logger.error(`Error viewing AI prompt: ${error.message}`);
    await interaction.editReply({
      content: `查看AI提示詞時發生錯誤：${error.message}`
    });
  }
}

/**
 * Handle edit prompt subcommand
 * @param {Interaction} interaction - The command interaction
 */
async function handleEditPrompt(interaction) {
  try {
    const departmentOption = interaction.options.getString('department');
    const departmentId = departmentOption === 'default' ? null : departmentOption;
    
    // Get the current prompt
    const prompt = await service.getPrompt(departmentId);
    
    let promptText = '';
    if (prompt) {
      promptText = prompt.promptText;
    } else if (departmentId && config.ai.departmentPrompts[departmentId]) {
      promptText = config.ai.departmentPrompts[departmentId];
    } else {
      promptText = config.ai.defaultPrompt;
    }
    
    // Format the department name for display
    let deptName = '預設';
    if (departmentId) {
      const dept = config.departments.find(d => d.id === departmentId);
      if (dept) deptName = dept.name;
    }
    
    // Create a modal for editing the prompt
    const modal = new ModalBuilder()
      .setCustomId(`edit_prompt:${departmentOption || 'default'}`)
      .setTitle(`編輯${deptName}部門AI提示詞`);
    
    const promptInput = new TextInputBuilder()
      .setCustomId('promptText')
      .setLabel('AI提示詞')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(promptText)
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(2000);
    
    const firstActionRow = new ActionRowBuilder().addComponents(promptInput);
    modal.addComponents(firstActionRow);
    
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Error editing AI prompt: ${error.message}`);
    await interaction.reply({
      content: `編輯AI提示詞時發生錯誤：${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle saving prompt to file
 * @param {Interaction} interaction - The command interaction
 */
async function handleSaveToFile(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const departmentOption = interaction.options.getString('department');
    const departmentId = departmentOption === 'default' ? null : departmentOption;
    
    // Get the prompt
    const prompt = await service.getPrompt(departmentId);
    
    if (!prompt) {
      await interaction.editReply({
        content: `找不到提示詞，無法儲存至檔案。`
      });
      return;
    }
    
    // Save to file
    await service.repository.savePromptToFile(departmentId, prompt.promptText);
    
    // Format the department name for display
    let deptName = '預設';
    if (departmentId) {
      const dept = config.departments.find(d => d.id === departmentId);
      if (dept) deptName = dept.name;
    }
    
    await interaction.editReply({
      content: `已成功將${deptName}部門的AI提示詞儲存至檔案！`
    });
  } catch (error) {
    logger.error(`Error saving AI prompt to file: ${error.message}`);
    await interaction.editReply({
      content: `儲存AI提示詞至檔案時發生錯誤：${error.message}`
    });
  }
}

/**
 * Handle loading prompt from file
 * @param {Interaction} interaction - The command interaction
 */
async function handleLoadFromFile(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const departmentOption = interaction.options.getString('department');
    const departmentId = departmentOption === 'default' ? null : departmentOption;
    
    // Get the prompt from file
    const filePrompt = await service.repository.getPromptFromFile(departmentId);
    
    if (!filePrompt) {
      // Format the department name for display
      let deptName = '預設';
      if (departmentId) {
        const dept = config.departments.find(d => d.id === departmentId);
        if (dept) deptName = dept.name;
      }
      
      await interaction.editReply({
        content: `找不到${deptName}部門的提示詞檔案。`
      });
      return;
    }
    
    // Save to database
    await service.updatePrompt(departmentId, filePrompt.promptText);
    
    // Format the department name for display
    let deptName = '預設';
    if (departmentId) {
      const dept = config.departments.find(d => d.id === departmentId);
      if (dept) deptName = dept.name;
    }
    
    await interaction.editReply({
      content: `已成功從檔案載入${deptName}部門的AI提示詞！`
    });
  } catch (error) {
    logger.error(`Error loading AI prompt from file: ${error.message}`);
    await interaction.editReply({
      content: `從檔案載入AI提示詞時發生錯誤：${error.message}`
    });
  }
}

/**
 * Handle prompt edit modal submission
 * @param {Interaction} interaction - The modal submit interaction
 * @param {string} departmentOption - The department option
 */
async function handlePromptEditSubmit(interaction, departmentOption) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const promptText = interaction.fields.getTextInputValue('promptText');
    const departmentId = departmentOption === 'default' ? null : departmentOption;
    
    // Save the prompt
    await service.updatePrompt(departmentId, promptText);
    
    // Format the department name for display
    let deptName = '預設';
    if (departmentId) {
      const dept = config.departments.find(d => d.id === departmentId);
      if (dept) deptName = dept.name;
    }
    
    await interaction.editReply({
      content: `${deptName}部門的AI提示詞已更新成功！`
    });
  } catch (error) {
    logger.error(`Error saving AI prompt: ${error.message}`);
    await interaction.editReply({
      content: `儲存AI提示詞時發生錯誤：${error.message}`
    });
  }
}

module.exports.handlePromptEditSubmit = handlePromptEditSubmit;