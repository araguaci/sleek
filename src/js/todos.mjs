"use strict"; 
import "../../node_modules/jstodotxt/jsTodoExtensions.js";
import { appData, userData, setUserData, translations, startBuilding } from "../render.js";
import { _paq } from "./matomo.mjs"; 
import { categories, selectFilter } from "./filters.mjs";
import { generateRecurrence } from "./recurrences.mjs";
import { convertDate, isToday, isTomorrow, isPast } from "./date.mjs";
import { show } from "./form.mjs"; 
import { SugarDueExtension, RecExtension, ThresholdExtension } from "./todotxtExtensions.mjs";
import { createModalJail } from "./jail.mjs";
import { getConfirmation } from "./prompt.mjs";
import { getActiveFile, generateHash, handleError, formatDate } from "./helper.mjs";
import { focusRow } from "./keyboard.mjs";
import { datePicker } from "./datePicker.mjs";

const todoContext = document.getElementById("todoContext");
const todoContextDelete = document.getElementById("todoContextDelete");
const todoContextEdit = document.getElementById("todoContextEdit");
const todoContextUseAsTemplate = document.getElementById("todoContextUseAsTemplate");
const todoTableWrapper = document.getElementById("todoTableWrapper");
const resultStats = document.getElementById("resultStats");
const todoTable = document.getElementById("todoTable");
const datePickerContainer = document.querySelector(".datepicker.datepicker-dropdown");
export let currentTodo;

todoContextUseAsTemplate.innerHTML = translations.useAsTemplate;
todoContextEdit.innerHTML = translations.edit;
todoContextDelete.innerHTML = translations.delete;
// ########################################################################################################################
// CONFIGURE MARKDOWN PARSER
// ########################################################################################################################
marked.setOptions({
  pedantic: false,
  gfm: true,
  breaks: false,
  sanitize: false,
  sanitizer: false,
  smartLists: false,
  smartypants: false,
  xhtml: false,
  baseUrl: "https://"
});
const renderer = {
  link(href, title, text) {
    // truncate the url
    //if(text.length > 40) text = text.slice(0, 40) + " [...] ";
    return `${text} <a href="${href}" target="_blank"><i class="fas fa-external-link-alt"></i></a>`;
  }
};
marked.use({ renderer });
// ########################################################################################################################
// PREPARE TABLE
// ########################################################################################################################
const tableContainerContent = document.createDocumentFragment();
const todoTableBodyRowTemplate = document.createElement("div");
const todoTableBodyCellCheckboxTemplate  = document.createElement("div");
const todoTableBodyCellTextTemplate = document.createElement("div");
const tableContainerCategoriesTemplate = document.createElement("div");
const todoTableBodyCellPriorityTemplate = document.createElement("div");
const todoTableBodyCellDueDateTemplate = document.createElement("span");
const todoTableBodyCellRecurrenceTemplate = document.createElement("span");
const todoTableBodyCellArchiveTemplate = document.createElement("span");
const todoTableBodyCellHiddenTemplate = document.createElement("span");
const item = { previous: "" }
let
  items,
  clusterCounter = 0,
  clusterSize = Math.ceil(window.innerHeight/32), // 32 being the pixel height of one todo in compact mode
  clusterThreshold = clusterSize,
  visibleRows,
  todoRows;

todoTableWrapper.addEventListener("scroll", function(event) {
  // abort if all todos are shown already
  if(visibleRows>=items.filtered.length) return false;
  // if the end of the page is reached start building
  if(Math.floor(event.target.scrollHeight - event.target.scrollTop) <= event.target.clientHeight) startBuilding();
});

function showResultStats() {
  try {
    // we show some information on filters if any are set
    if(items.filtered.length!=items.objects.length) {
      resultStats.classList.add("is-active");
      resultStats.firstElementChild.innerHTML = translations.visibleTodos + "&nbsp;<strong>" + items.filtered.length + " </strong>&nbsp;" + translations.of + "&nbsp;<strong>" + items.objects.length + "</strong>";
      return Promise.resolve("Info: Result box is shown");
    } else {
      resultStats.classList.remove("is-active");
      return Promise.resolve("Info: Result box is hidden");
    }
  } catch(error) {
    error.functionName = showResultStats.name;
    return Promise.reject(error);
  }
}
function configureTodoTableTemplate() {
  try {
    todoTableBodyRowTemplate.setAttribute("class", "todo");
    todoTableBodyRowTemplate.setAttribute("tabindex", "0");
    todoTableBodyCellCheckboxTemplate.setAttribute("class", "cell checkbox");
    todoTableBodyCellTextTemplate.setAttribute("class", "cell text");
    todoTableBodyCellTextTemplate.setAttribute("href", "#");
    tableContainerCategoriesTemplate.setAttribute("class", "cell categories");
    todoTableBodyCellDueDateTemplate.setAttribute("class", "cell itemDueDate");
    todoTableBodyCellRecurrenceTemplate.setAttribute("class", "cell recurrence");
    return Promise.resolve("Success: Table templates set up");
  } catch(error) {
    error.functionName = configureTodoTableTemplate.name;
    return Promise.reject(error);
  }
}
async function generateItems(content) {
  try {
    items = await { objects: TodoTxt.parse(content, [ new SugarDueExtension(), new HiddenExtension(), new RecExtension(), new ThresholdExtension() ]) }
    items.complete = items.objects.filter(function(item) { return item.complete === true });
    items.incomplete = items.objects.filter(function(item) { return item.complete === false });
    items.objects = items.objects.filter(function(item) { return item.toString() != "" });
    return Promise.resolve(items);
  } catch(error) {
    error.functionName = generateItems.name;
    return Promise.reject(error);
  }
}
function generateGroups(items) {
  const sortBy = userData.sortBy[0];
  // build object according to sorting method
  items = items.reduce((object, a) => {
    if(userData.sortCompletedLast && a.complete) {
      object["completed"] = [...object["completed"] || [], a];
    } else if(sortBy==="dueString" && !a.due) {
      object["noDueDate"] = [...object["noDueDate"] || [], a];
    } else if(sortBy==="date" && a.date) {
      object[a.dateString()] = [...object[a.dateString()] || [], a];  
    } else {
      object[a[sortBy]] = [...object[a[sortBy]] || [], a];
    }
    return object;
  }, {});

  // object is converted to a sorted array
  items = Object.entries(items).sort(function(a,b) {
    // when a is null sort it after b
    if(a[0]==="null" || a[0]==="noDueDate") {
      if(userData.invertSorting) return -1;
      return 1;
    }
    // when b is null sort it after a
    if(b[0]==="null" || b[0]==="noDueDate") {
      if(userData.invertSorting) return 1;
      return -1;
    }
    // invert sorting when sort is by creation date
    if(sortBy === "date" && a[0] < b[0]) {
      return 1;
    }
    if(sortBy === "date" && a[0] > b[0]) {
      return -1;
    }
    // sort the rest alphabetically
    if(a[0] < b[0]) {
      return -1;
    }
  });
  // sort completed todo to the end of the list
  if(userData.sortCompletedLast) {
    items.sort(function(a,b) {
      // when a is null sort it after b
      if(a[0]==="completed") return 1;
      // when b is null sort it after a
      if(b[0]==="completed") return -1;
      return 0;
    });
  }
  // sort the items within the groups
  items.forEach((group) => {
    group[1] = sortTodoData(group[1]);
  });

  // invert sorting
  if(userData.invertSorting) items = items.reverse();

  return Promise.resolve(items)
}
async function generateTable(groups, loadAll) {
  try {
    todoRows = new Array;
    // TODO Overthink due to performance reasons
    todoTable.textContent = "";
    // configure stats
    showResultStats();
    // prepare the templates for the table
    await configureTodoTableTemplate();
    if(!userData.sortByFile) {
      // reset cluster count for this run
      for (let group in groups) {
        const headline = groups[group][0];
        const firstItemInGroup = groups[group][1][0];
        const sortBy = userData.sortBy[0];
        let dividerRow;
        // completed todos
        if(userData.sortCompletedLast && headline==="completed") {
          dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group " + sortBy + " " + headline + "\"><div class=\"cell\"></div></div>")
        // for priority, context and project
        } else if(headline!="null" && sortBy!="dueString" && sortBy!="date") {
          dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group " + sortBy + " " + headline + "\"><div class=\"cell\"><button tabindex=\"-1\" class=\"" + headline + "\">" + headline.replace(/,/g, ', ') + "</button></div></div>")
        // if sorting is by due date
        } else if(sortBy==="dueString" && sortBy!="date" && firstItemInGroup.due) {
          if(isToday(firstItemInGroup.due)) {
            dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group due\"><div class=\"cell isToday\">" + translations.today + "</button></div></div>")
          } else if(isTomorrow(firstItemInGroup.due)) {
            dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group due\"><div class=\"cell isTomorrow\">" + translations.tomorrow + "</button></div></div>")
          } else if(isPast(firstItemInGroup.due)) {
            dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group due\"><div class=\"cell isPast\">" + headline + "</button></div></div>")
          } else {
            dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group due\"><div class=\"cell\">" + headline + "</button></div></div>")
          }
        // empty divider row
        } else {
          dividerRow = document.createRange().createContextualFragment("<div id=\"" + sortBy + headline + "\" class=\"group due\"><div class=\"cell\">&nbsp;</div></div>")
        }
        if(!document.getElementById(sortBy + headline) && dividerRow) todoRows.push(dividerRow);
        // loop through items in group
        for (let item in groups[group][1]) {
          const todo = groups[group][1][item];
          // incompleted todos with due date
          if (todo.due && !todo.complete) {
          // create notification
            if(isToday(todo.due)) {
              generateNotification(todo, 0).then(response => {
                console.log(response);
              }).catch(error => {
                handleError(error);
              });
            } else if(isTomorrow(todo.due)) {
              generateNotification(todo, 1).then(response => {
                console.log(response);
              }).catch(error => {
                handleError(error);
              });
            }
          }
          todoRows.push(generateTableRow(todo));
        }
      }
    } else {
      // generate rows exactly as in file
      items.filtered.forEach(function(todo) {
        // create notification
        if(todo.due && !todo.complete) {
          if(isToday(todo.due)) {
            generateNotification(todo, 0).then(response => {
              console.log(response);
            }).catch(error => {
              handleError(error);
            });
          } else if(isTomorrow(todo.due)) {
            generateNotification(todo, 1).then(response => {
              console.log(response);
            }).catch(error => {
              handleError(error);
            });
          }
        }
        todoRows.push(generateTableRow(todo));
      });
      // invert sorting
      if(userData.invertSorting) todoRows = todoRows.reverse();
    }
    // append rows to todo container
    for (let row in todoRows) {
      // loadAll mostly used in print function
      if(loadAll) {
        tableContainerContent.appendChild(todoRows[row]);
        continue;
      }
      clusterCounter++;
      visibleRows++;
      if(clusterCounter === clusterThreshold) {
        clusterThreshold = clusterThreshold + clusterCounter;
        break;
      } else if(visibleRows < clusterThreshold) {
        continue;
      } else {
        todoTable.appendChild(todoRows[row]);
      }
    }
    // reset cluster counter
    clusterCounter = 0;
    // append container to table
    //todoTable.appendChild(tableContainerContent);
    return Promise.resolve("Success: Todo table generated");
  } catch(error) {
    error.functionName = generateTable.name;
    return Promise.reject(error);
  }
}
function generateTableRow(todo) {
  try {
    // create nodes from templates
    let todoTableBodyRow = todoTableBodyRowTemplate.cloneNode(true);
    let todoTableBodyCellCheckbox = todoTableBodyCellCheckboxTemplate.cloneNode(true);
    let todoTableBodyCellText = todoTableBodyCellTextTemplate.cloneNode(true);
    let tableContainerCategories = tableContainerCategoriesTemplate.cloneNode(true);
    let todoTableBodyCellPriority = todoTableBodyCellPriorityTemplate.cloneNode(true);
    let todoTableBodyCellDueDate = todoTableBodyCellDueDateTemplate.cloneNode(true);
    let todoTableBodyCellRecurrence = todoTableBodyCellRecurrenceTemplate.cloneNode(true);
    let todoTableBodyCellArchive = todoTableBodyCellArchiveTemplate.cloneNode(true);
    let todoTableBodyCellHidden = todoTableBodyCellHiddenTemplate.cloneNode(true);
    const sortBy = userData.sortBy[0];
    // if new item was saved, row is being marked
    if(todo.toString()==item.previous) {
      todoTableBodyRow.setAttribute("id", "previousItem");
      item.previous = null;
    }
    // start with the individual config of the items
    if(todo.complete) {
      todoTableBodyRow.setAttribute("class", "todo completed");
    }
    todoTableBodyRow.setAttribute("data-item", todo.toString());
    // add the priority marker or a white spacer
    if(todo.priority && (sortBy === "priority" && !userData.sortByFile)) {
      todoTableBodyCellPriority.setAttribute("class", "cell priority " + todo.priority);
      todoTableBodyRow.appendChild(todoTableBodyCellPriority);
    }
    // add the checkbox
    if(todo.complete) {
      todoTableBodyCellCheckbox.setAttribute("title", translations.inProgress);
      todoTableBodyCellCheckbox.innerHTML = "<i class=\"fas fa-check-circle\"></i>";
    } else {
      todoTableBodyCellCheckbox.setAttribute("title", translations.done);
      todoTableBodyCellCheckbox.innerHTML = "<i class=\"far fa-circle\"></i>";
    }
    // add a listener on the checkbox to call the completeItem function
    todoTableBodyCellCheckbox.onclick = function() {
      // passing the data-item attribute of the parent tag to complete function
      setTodoComplete(this.parentElement.getAttribute("data-item")).then(response => {
         console.log(response);
      }).catch(error => {
        handleError(error);
      });
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table", "Click on Checkbox"]);
    }
    todoTableBodyRow.appendChild(todoTableBodyCellCheckbox);
    // add archiving icon
    if(todo.complete) {
      todoTableBodyCellArchive.setAttribute("class", "cell archive");
      todoTableBodyCellArchive.innerHTML = "<a href=\"#\"><i class=\"fas fa-archive\"></i></a>";
      todoTableBodyCellArchive.onclick = function() {
        getConfirmation(archiveTodos, translations.archivingPrompt);
        // trigger matomo event
        if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table", "Click on Archive button"]);
      }
      // append the due date to the text item
      todoTableBodyRow.appendChild(todoTableBodyCellArchive);
    }
    // add hidden icon
    if(todo.h) {
      todoTableBodyRow.setAttribute("class", "todo is-greyed-out");
      todoTableBodyCellHidden.setAttribute("class", "cell");
      todoTableBodyCellHidden.innerHTML = "<i class=\"far fa-eye-slash\"></i>";
      // append the due date to the text item
      todoTableBodyRow.appendChild(todoTableBodyCellHidden);
    }
    // creates cell for the text
    if(todo.text) {
      if(todo.priority && (sortBy!=="priority" || userData.sortByFile)) todoTableBodyCellText.innerHTML = "<span class=\"priority\"><button class=\"" + todo.priority + "\">" + todo.priority + "</button></span>";
      // parse text string through markdown parser
      todoTableBodyCellText.innerHTML +=  "<span class=\"text\">" + marked.parseInline(todo.text) + "</span>";
      // replace line feed character with a space
      todoTableBodyCellText.innerHTML = todoTableBodyCellText.innerHTML.replaceAll(String.fromCharCode(16)," ");
      // add a spacer to divide text (and link) and categories
      todoTableBodyCellText.innerHTML += " ";
    }
    // click on the text
    todoTableBodyCellText.onclick = function() {
      // if the clicked item is not the external link icon, show(true) will be called
      if(!event.target.classList.contains("fa-external-link-alt")) {
        show(this.parentElement.getAttribute("data-item"));
        // trigger matomo event
        if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table", "Click on Todo item"]);
      }
    }
    // add the text cell to the row
    todoTableBodyRow.appendChild(todoTableBodyCellText);
    // check for and add a given due date
    if(todo.due) {
      var tag = convertDate(todo.due);
      if(isToday(todo.due)) {
        todoTableBodyCellDueDate.classList.add("isToday");
        tag = translations.today;
      } else if(isTomorrow(todo.due)) {
        todoTableBodyCellDueDate.classList.add("isTomorrow");
        tag = translations.tomorrow;
      } else if(isPast(todo.due)) {
        todoTableBodyCellDueDate.classList.add("isPast");
      }
      todoTableBodyCellDueDate.innerHTML = `
        <i class="far fa-clock"></i>
        <div class="tags has-addons">
          <span class="tag">` + translations.due + `</span><span class="tag is-dark">` + tag + `</span>
        </div>
        <i class="fas fa-sort-down"></i>`;
      todoTableBodyCellDueDate.addEventListener("click", function(event) {
        // make current todo available to datepicker module
        currentTodo = todo;
        datePicker.setDate(todo.due);
        datePicker.show();
        // position datepicker container to pointer position
        datePickerContainer.style.position = "fixed";
        datePickerContainer.style.top = event.y + "px";
        datePickerContainer.style.left = event.x - (datePickerContainer.offsetWidth/2) + "px";

        // ugly but neccessary: if class is written too fast, we cannot work with it in body event
        setTimeout (function () {
          datePickerContainer.classList.add("visible");
          }, 10 
        );
      });
      // append the due date to the text item
      todoTableBodyRow.appendChild(todoTableBodyCellDueDate);
    }
    // add recurrence icon
    if(todo.rec) {
      todoTableBodyCellRecurrence.innerHTML = "<i class=\"fas fa-redo\"></i>";
      // append the due date to the text item
      todoTableBodyRow.appendChild(todoTableBodyCellRecurrence);
    }
    // cell for the categories
    categories.forEach(category => {
      if(todo[category] && category!="priority") {
        todo[category].forEach(element => {
          let todoTableBodyCellCategory = document.createElement("a");
          todoTableBodyCellCategory.setAttribute("class", "tag " + category);
          todoTableBodyCellCategory.onclick = function() {
            selectFilter(element, category);
          }
          todoTableBodyCellCategory.innerHTML = element;

          // selected filters are empty, unless they were persisted
          if(userData.selectedFilters && userData.selectedFilters.length>0) {
            let selectedFilters = JSON.parse(userData.selectedFilters);
            selectedFilters.forEach(function(item) {
              if(JSON.stringify(item) === '["'+element+'","'+category+'"]') todoTableBodyCellCategory.classList.toggle("is-dark")
            });
          }
          tableContainerCategories.appendChild(todoTableBodyCellCategory);
        });
      }
    });
    // only add the categories to text cell if it has child nodes
    if(tableContainerCategories.hasChildNodes()) todoTableBodyRow.appendChild(tableContainerCategories);
    todoTableBodyRow.addEventListener("contextmenu", () => {
      createTodoContext(todoTableBodyRow).then(response => {
        console.log(response);
      }).catch(error => {
        handleError(error);
      });
      const index = Array.prototype.indexOf.call(todoTable.querySelectorAll(".todo"), todoTableBodyRow);
      focusRow(index);
    });
    todoTableBodyRow.onclick = function(event) {
      const index = Array.prototype.indexOf.call(todoTable.querySelectorAll(".todo"), todoTableBodyRow);
      focusRow(index);
    }
    todoTableBodyRow.ondblclick = function(event) {
      show(this.getAttribute("data-item"));
    }
    // return the fully built row
    return todoTableBodyRow;
  } catch(error) {
    error.functionName = generateTableRow.name;
    return Promise.reject(error);
  }
}
function createTodoContext(todoTableRow) {
  try {
    //TODO: Clean up duplicates
    const todo = todoTableRow.getAttribute("data-item");
    todoContext.setAttribute("data-item", todo.toString())
    // click on use as template option
    todoContextUseAsTemplate.onclick = function() {
      show(todoContext.getAttribute('data-item'), true);
      //todoContext.classList.toggle("is-active");
      todoContext.removeAttribute("data-item");
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table-Context", "Click on Use as template"]);
    }
    todoContextUseAsTemplate.onkeypress = function(event) {
      if(event.key !== "Enter") return false;
      show(todoContext.getAttribute('data-item'), true);
      //todoContext.classList.toggle("is-active");
      todoContext.removeAttribute("data-item");
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table-Context", "Enter on Use as template"]);
    }
    // click on use as edit option
    todoContextEdit.onclick = function() {
      show(todoContext.getAttribute("data-item"));
      //todoContext.classList.toggle("is-active");
      todoContext.removeAttribute("data-item");
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table-Context", "Click on Edit"]);
    }
    todoContextEdit.onkeypress = function() {
      if(event.key !== "Enter") return false;
      show(todoContext.getAttribute("data-item"));
      //todoContext.classList.remove("is-active");
      todoContext.removeAttribute("data-item");
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table-Context", "Enter on Edit"]);
    }
    // click on delete
    todoContextDelete.onclick = function() {
      // passing the data-item attribute of the parent tag to complete function
      setTodoDelete(todoContext.getAttribute('data-item')).then(response => {
        console.log(response);
        todoContext.classList.remove("is-active");
        todoContext.removeAttribute("data-item");
      }).catch(error => {
        handleError(error);
      });
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table-Context", "Click on Delete"]);
    }
    todoContextDelete.onkeypress = function() {
      if(event.key !== "Enter") return false;
      // passing the data-item attribute of the parent tag to complete function
      setTodoDelete(todoContext.getAttribute('data-item')).then(response => {
        console.log(response);
        todoContext.classList.remove("is-active");
        todoContext.removeAttribute("data-item");
      }).catch(error => {
        handleError(error);
      });
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Todo-Table-Context", "Enter on Delete"]);
    }

    todoContext.classList.add("is-active");

    if(!event.x && !event.y) {
      let box = todoTableRow.getBoundingClientRect();
      todoContext.style.left = box.right - todoContext.offsetWidth + "px";
      todoContext.style.top = box.top + "px";
    } else {
      todoContext.style.left = event.x + "px";
      todoContext.style.top = event.y + "px";
    }
    
    // ugly but neccessary: if triggered to fast arrow right will do a first row change in jail 
    setTimeout (function () {
      createModalJail(todoContext);
      }, 10 
    );

    return Promise.resolve("Success: Context opened");
  } catch(error) {
    error.functionName = createTodoContext.name;
    return Promise.reject(error);
  }
}
function sortTodoData(group) {
  try {
    // start at 1 to skip sorting method used for 1st level grouping
    for(let i = 1; i < userData.sortBy.length; i++) {
      group.sort(function(a, b) {
        // only continue if the two items have the same filters from the previous iteration
        if(i>1 && JSON.stringify(a[userData.sortBy[i-2]]) !== JSON.stringify(b[userData.sortBy[i-2]]) ) return;
        if(i>1 &&  JSON.stringify(a[userData.sortBy[i-1]]) !== JSON.stringify(b[userData.sortBy[i-1]]) ) return;
        let
          item1 = a[userData.sortBy[i]],
          item2 = b[userData.sortBy[i]];

        //TODO: Make it more generic
        // when item1 is empty or bigger than item2, item 1 will be sorted after item2
        // invert sorting for creation date
        if(userData.sortBy[i] === "date" && (!item1 && item2 || item1 < item2)) {
          return 1;
        // when item2 is empty or bigger than item1, item 1 will be sorted before item2
        // invert sorting for creation date
        } else if(userData.sortBy[i] === "date" && (item1 && !item2 || item1 > item2)) {
          return -1;
        // when item1 is empty or bigger than item2, item 1 will be sorted after item2
        } else if(!item1 && item2 || item1 > item2) {
          // invert sorting for creation date
          //if(userData.sortBy[i] === "date") return -1;
          return 1;
        // when item2 is empty or bigger than item1, item 1 will be sorted before item2
        } else if(item1 && !item2 || item1 < item2) {
          return -1;
        }
        // no change to sorting
        return;
      });
    }
    // invert sorting if set
    if(userData.sort) group = group.reverse();

    return group;
  } catch(error) {
    error.functionName = sortTodoData.name;
    return Promise.reject(error);
  }
}
function setTodoComplete(todo) {
  try {
    // first convert the string to a todo.txt object
    todo = new TodoTxtItem(todo, [ new DueExtension(), new HiddenExtension(), new RecExtension(), new ThresholdExtension() ]);
    // get index of todo
    const index = items.objects.map(function(item) {return item.toString(); }).indexOf(todo.toString());
    // mark item as in progress
    if(todo.complete) {
      // if item was already completed we set complete to false and the date to null
      todo.complete = false;
      todo.completed = null;
      // delete old item from array and add the new one at it's position
      //items.objects.splice(index, 1, todo);
    // Mark item as complete
    } else if(!todo.complete) {
      if(todo.due) {
        const date = convertDate(todo.due);
        // if set to complete it will be removed from persisted notifcations
        if(userData.dismissedNotifications) {
          // the one set for today
          userData.dismissedNotifications = userData.dismissedNotifications.filter(e => e !== generateHash(date + todo.text)+0);
          // the one set for tomorrow
          userData.dismissedNotifications = userData.dismissedNotifications.filter(e => e !== generateHash(date + todo.text)+1);
          setUserData("dismissedNotifications", userData.dismissedNotifications);
        }
      }
      todo.complete = true;
      todo.completed = new Date();
      // if recurrence is set start generating the recurring todo
      if(todo.rec) generateRecurrence(todo)
      if(todo.priority) {
        // and preserve prio
        todo.text += " pri:" + todo.priority
        // finally remove priority
        todo.priority = null;
      }

    }
    // delete old todo from array and add the new one at it's position
    items.objects.splice(index, 1, todo);
    //write the data to the file and advice to focus the row after reload
    window.api.send("writeToFile", [items.objects.join("\n").toString() + "\n"]);
    return Promise.resolve("Success: Changes written to file: " + getActiveFile());
  } catch(error) {
    error.functionName = setTodoComplete.name;
    return Promise.reject(error);
  }
}
function setTodoDelete(todo) {
  try {
    // in case edit form is open, text has changed and complete button is pressed, we do not fall back to the initial value of todo but instead choose input value
    if(document.getElementById("modalFormInput").value) todo = document.getElementById("modalFormInput").value;
    // first convert the string to a todo.txt object
    todo = new TodoTxtItem(todo, [ new DueExtension(), new HiddenExtension(), new RecExtension(), new ThresholdExtension() ]);
    // get index of todo
    const index = items.objects.map(function(item) {return item.toString(); }).indexOf(todo.toString());
    // Delete item
    if(todo.due) {
      var date = convertDate(todo.due);
      // if deleted it will be removed from persisted notifcations
      if(userData.dismissedNotifications) {
        // the one set for today
        userData.dismissedNotifications = userData.dismissedNotifications.filter(e => e !== generateHash(date + todo.text)+0);
        // the one set for tomorrow
        userData.dismissedNotifications = userData.dismissedNotifications.filter(e => e !== generateHash(date + todo.text)+1);
        setUserData("dismissedNotifications", userData.dismissedNotifications);
      }
    }
    items.objects.splice(index, 1);
    //write the data to the file
    window.api.send("writeToFile", [items.objects.join("\n").toString() + "\n"]);
    return Promise.resolve("Success: Changes written to file: " + getActiveFile());
  } catch(error) {
    error.functionName = setTodoDelete.name;
    return Promise.reject(error);
  }
}
function addTodo(todo) {
  try {
    todo = new TodoTxtItem(todo, [ new SugarDueExtension(), new HiddenExtension(), new RecExtension(), new ThresholdExtension() ]);
    // abort if there is no text
    if(!todo.text && !todo.h) return Promise.resolve("Info: Text is missing, no todo is written");
    // we add the current date to the start date attribute of the todo.txt object
    todo.date = new Date();
    // get index of todo
    const index = items.objects.map(function(item) { return item.toString(); }).indexOf(todo.toString());
    if(index===-1) {
      // we build the array
      items.objects.push(todo);
      //write the data to the file
      // a newline character is added to prevent other todo.txt apps to append new todos to the last line
      window.api.send("writeToFile", [items.objects.join("\n").toString() + "\n"]);
      return Promise.resolve("Success: New todo added to file: " + getActiveFile());
    } else {
      return Promise.resolve("Info: Todo already in file, nothing will be written");
    }
  } catch (error) {
    return Promise.reject(error);
  }
}
function editTodo(index, todo) {
  try {
    // put changed todo at old position
    items.objects.splice(index, 1, todo);
    // save to file
    window.api.send("writeToFile", [items.objects.join("\n").toString() + "\n"]);
    return Promise.resolve("Success: Todo edited");
  } catch(error) {
    error.functionName = editTodo.name;
    return Promise.reject(error);
  }
}
async function archiveTodos() {
  try {
    const index = userData.files.findIndex(file => file[0]===1);
    const file = userData.files[index][1];
    // cancel operation if there are no completed todos
    if(items.complete.length===0) return Promise.resolve("Info: No completed todos found, nothing will be archived")
    // if user archives within done.txt file, operating is canceled
    if(file.includes("_done.")) return Promise.resolve("Info: Current file seems to be a done.txt file, won't archive")
    // define path to done.txt
    let doneFile = function() {
      if(appData.os==="windows") {
        return file.replace(file.split("\\").pop(), file.substr(0, file.lastIndexOf(".")).split("\\").pop() + "_done.txt");
      } else {
        return file.replace(file.split("/").pop(), file.substr(0, file.lastIndexOf(".")).split("/").pop() + "_done.txt");
      }
    }
    const getContentFromDoneFile = new Promise(function(resolve) {
      window.api.send("getContent", doneFile());
      return window.api.receive("getContent", (content) => {
        resolve(content);
      });
    });
    let contentFromDoneFile = await getContentFromDoneFile;
    let contentForDoneFile = items.complete;
    if(contentFromDoneFile) {
      // create array from done file
      contentFromDoneFile = contentFromDoneFile.split("\n");
      //combine the two arrays
      contentForDoneFile  = contentFromDoneFile.concat(items.complete.toString().split(","));
      // use Set function to remove the duplicates: https://www.javascripttutorial.net/array/javascript-remove-duplicates-from-array/
      contentForDoneFile= [...new Set(contentForDoneFile)];
      // remove empty entries
      contentForDoneFile = contentForDoneFile.filter(function(element) {
        return element;
      });
    }
    //write completed items to done file
    window.api.send("writeToFile", [contentForDoneFile.join("\n").toString() + "\n", doneFile()]);
    // write incompleted items to todo file
    window.api.send("writeToFile", [items.incomplete.join("\n").toString() + "\n", file]);
    // send notifcation on success
    generateNotification(null, null, translations.archivingCompletedTitle, translations.archivingCompletedBody + doneFile());

    return Promise.resolve("Success: Completed todos appended to: " + doneFile())
  } catch(error) {
    error.functionName = archiveTodos.name;
    return Promise.reject(error);
  }
}
function generateNotification(todo, offset, customTitle, customBody) {
  try {
    // abort if user didn't permit notifications within sleek
    if(!userData.notifications) return Promise.resolve("Info: Notification surpressed (turned off in sleek's settings)");
    // check for necessary permissions
    return navigator.permissions.query({name: "notifications"}).then(function(result) {
      // abort if user didn't permit notifications
      if(result.state!="granted") return Promise.resolve("Info: Notification surpressed (not permitted by OS)");
      let notification;
      if(todo) {
        // add the offset so a notification shown today with "due tomorrow", will be shown again tomorrow but with "due today"
        const hash = generateHash(todo.toString()) + offset;
        let title;
        switch (offset) {
          case 0:
            title = translations.dueToday;
            break;
          case 1:
            title = translations.dueTomorrow;
            break;
        }
        // if notification already has been triggered once it will be discarded
        if(userData.dismissedNotifications.includes(hash)) return Promise.resolve("Info: Notification skipped (has already been sent)");
        // set options for notifcation
        notification = {
          title: title,
          body: todo.text,
          string: todo.toString(),
          timeoutType: "never",
          silent: false,
          actions: [{
            type: "button",
            text: "Show Button"
          }]
        }
        // once shown, it will be persisted as hash to it won't be shown a second time
        userData.dismissedNotifications.push(hash);
        setUserData("dismissedNotifications", userData.dismissedNotifications);
      } else {
        notification = {
          title: customTitle,
          body: customBody,
          timeoutType: "default",
          silent: true
        }
      }
      // send notification object to main process for execution
      window.api.send("showNotification", notification);
      // trigger matomo event
      if(userData.matomoEvents) _paq.push(["trackEvent", "Notification", "Shown"]);
      return Promise.resolve("Info: Notification successfully sent");
    });
  } catch(error) {
    error.functionName = generateNotification.name;
    return Promise.reject(error);
  }
}

export { generateItems, generateGroups, generateTable, items, item, setTodoComplete, archiveTodos, addTodo, editTodo, show, createTodoContext };
