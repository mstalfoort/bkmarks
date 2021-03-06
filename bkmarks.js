$(function() {

  String.prototype.getHostname = function() {
    var url_regex = new RegExp('^((?:f|ht)tp(?:s)?\://)?([^/]+)', 'im');
      var url_match = this.match(url_regex);
    if (url_match) {
      var hostname = url_match[2].toString();
      var subdomain_match = hostname.match(/^(.+)\.((.+)\.(.+))$/);
      if (subdomain_match) {
        hostname = subdomain_match[2];
      }
      return hostname;
    } else
      return "";
  };

  window.Util = {
    parseTags: function(tags_input) {
      return _.uniq(tags_input.trim().split(/,?\s+/));
    },

    delay: (function() {
      var timer = 0;
      return function(callback, ms) {
        clearTimeout(timer);
        timer = setTimeout(callback, ms);
      };
    })(),
  };

  window.Bookmark = Backbone.Model.extend({
    initialize: function() {
      _.bindAll(this, 'hasTag', 'hasTags');
      if (this.isNew() && this.get("url")) {
        this.setHostname();
        this.addProtocolToUrl();
      }
      this.bind('change:url', this.setHostname);
      this.bind('change:url', this.addProtocolToUrl);
    },

    hasTag: function(tag) {
      return _.include(this.get("tags"), tag);
    },

    // Optimize.
    hasTags: function(tags) {
      return _.all(tags, this.hasTag);
    },

    // Ugly hack - I'm learning BackboneJS, not string searching algorithms
    // (but boy was I tempted).
    titleContains: function(words) {
      var regex = _.reduce(words, function(re, word) {
        return re + "(" + word + ").*?";
      }, "");
      return this.get("title").search(new RegExp(regex, "i")) != -1;
    },

    tagsAsString: function() {
      return this.get("tags").join(", ");
    },

    addProtocolToUrl: function() {
      if (!this.get("url").match(/https?:\/\//)) {
        this.set({url: "http://" + this.get("url")});
      }
    },

    setHostname: function() {
      var host = this.get("url").getHostname();
      var ret = this.set({hostname: host});
    },

    validate: function(attrs) {
      if (!(typeof attrs.title === 'undefined') && attrs.title == "") {
        return "Title can't be blank";
      }
      if (!(typeof attrs.url === 'undefined') && attrs.url == "" ) {
        return "Url can't be blank";
      }
    }
  });


  window.BookmarkList = Backbone.Collection.extend({
    model: Bookmark,

    localStorage: new Store("bks"),

    searchByTag: function(keywords) {
      var tags = Util.parseTags(keywords);
      return this.select(function(bk) { return bk.hasTags(tags); });
    },

    searchByTitle: function(keywords) {
      var words = keywords.split(/\s+/);
      return this.select(function(bk) { return bk.titleContains(words); });
    },

    searchByUrl: function(keywords) {
      var words = keywords.split(/\s+/);
      return this.select(function(bk) {
        var domain = bk.get("hostname").match(/(.*?)\./)[1];
        return _.include(words, domain);
      });
    },

    search: function(keywords) {
      var tagsResults = this.searchByTag(keywords);
      var titleResults = this.searchByTitle(keywords);
      var urlResults = this.searchByUrl(keywords);
      return tagsResults.concat(titleResults, urlResults);
    },
  });
  window.Bookmarks = new BookmarkList;
  window.NotResultsIndexes = new Array();


  window.BookmarkView = Backbone.View.extend({
    tagName: "li",

    template: _.template($("#bk-template").html()),

    events: {
      "mouseover": "showControls",
      "mouseout": "hideControls",
      "click .destroy-img": "destroy",
      "click .edit-img": "startEdit",
      "click .edit-btn": "edit",
      "click .cancel-edit": "cancelEdit",
      "keypress": "editOnEnter",
      "keyup": "cancelEditOnEscape",
    },

    initialize: function() {
      _.bindAll(this, 'render', 'showControls', 'hideControls', 'destroy', 'showError');
      this.model.bind('change', this.render);
      this.model.view = this;
    },

    render: function() {
      var json = this.model.toJSON();
      json.tags = this.model.tagsAsString();
      $(this.el).html(this.template(json));
      if (this.model.tagsAsString() == "") {
        this.$(".tags").text("no tags");
        this.$(".tags").addClass("quiet");
      }
      return this;
    },

    highlight: function() {
      $(this.el).effect("highlight", { color: "#caeeea" }, 1500);
    },

    showControls: function() {
      this.$(".controls").show();
    },

    hideControls: function() {
      this.$(".controls").hide();
    },

    destroy: function() {
      this.model.destroy();
      this.remove();
    },

    centerEditForm: function() {
      $('html,body').animate({
        scrollTop: '+=' + this.$('.edit').offset().top + 'px'
      }, 'slow');
    },

    configureEditForm: function() {
      this.$(".saved").hide();
      this.$(".edit").show("slow");
      this.centerEditForm();
      this.editTitle.val(this.model.get("title"));
      this.editUrl.val(this.model.get("url"));
      this.editTags.val(this.model.tagsAsString());
      this.editTitle.focus();
    },

    startEdit: function() {
      this.editTitle = this.$(".edit_title");
      this.editUrl = this.$(".edit_url");
      this.editTags = this.$(".edit_tags");
      this.configureEditForm();
    },

    edit: function() {
      var tags = Util.parseTags(this.editTags.val());
      var res = this.model.save({
        title: this.editTitle.val(),
        url: this.editUrl.val(),
        tags: tags,
      }, { error: this.showError });
      if (res) {
        this.cancelEdit();
        this.highlight();
      }
    },

    showError: function(model, error) {
      alert(error);
    },

    cancelEdit: function() {
      this.$(".edit").hide();
      this.$(".saved").show("fast");
    },

    cancelEditOnEscape: function(e) {
      if (e.keyCode != 27) return;
      this.cancelEdit();
    },

    editOnEnter: function(e) {
      if (e.keyCode != 13) return;
      this.edit();
    },

    remove: function() {
      $(this.el).fadeOut('fast', function() { $(this.el).remove(); });
    },

    hide: function() {
      $(this.el).hide('slow');
    },

    show: function() {
      $(this.el).show('slow');
    },
  });


  window.SearchView = Backbone.View.extend({
    el: $("#search"),

    events: {
      "keypress": "searchOnEnter",
      "keyup": "clearOrDelayedSearch",
      "click #clear-search": "clearSearch",
    },

    initialize: function() {
      _.bindAll(this, 'render', 'search', 'clearSearch');
    },

    clearSearch: function() {
      this.$("input").val('');
      _.each(NotResultsIndexes, function(idx) { Bookmarks.at(idx).view.show(); });
      NotResultsIndexes.length = 0;
      App.refreshCount();
      this.$("#clear-search").hide();
    },

    search: function() {
      var results = Bookmarks.search(this.$("input").val());
      NotResultsIndexes.length = 0;
      Bookmarks.each(function(bk, idx) {
        if (_.include(results, bk))
          bk.view.show();
        else {
          bk.view.hide();
          NotResultsIndexes.push(idx);
        }
      });
      App.refreshCount();
      if (NotResultsIndexes.length > 0)
        this.$("#clear-search").show();
    },

    searchOnEnter: function(e) {
      if (e.keyCode != 13) return;
      this.search();
    },

    clearOrDelayedSearch: function(e) {
      if (e.keyCode == 27) {
        this.clearSearch();
        this.$("input").blur();
      } else {
        var input = this.$("input");
        var search = this.search;
        var clearSearch = this.clearSearch;
        Util.delay(function() {
          if (input.val())
            search();
          else
            clearSearch();
        }, 500);
      }
    },
  });
  window.Search = new SearchView;

  window.AppView = Backbone.View.extend({
    el: $("#bkmarks-app"),

    events: {
      "click #save-btn": "create",
      "keypress": "createOnEnter",
      "keyup": "cancelCreateOnEscape",
      "click #start-create": "startCreate",
      "click #cancel-create": "cancelCreate",
    },

    initialize: function() {
      _.bindAll(this, 'render', 'addOne', 'addAll', 'clear');
      this.title = this.$("#new_title");
      this.url = this.$("#new_url");
      this.tags = this.$("#new_tags");
      Bookmarks.bind('add', this.addOne);
      Bookmarks.bind('refresh', this.addAll);
      Bookmarks.bind('remove', this.render);
      Bookmarks.bind('all', this.render);
      Bookmarks.fetch();
      this.highlightNextAdd = false;
      this.notResultsIndexes = [];
    },

    render: function() {
      this.refreshCount();
      if (Bookmarks.length == 0) {
        this.startCreate();
      }
      return this;
    },

    showError: function(model, error) {
      $("#error").text(error);
      $("#error").addClass("error");
      $("#error").show();
      $("#error").fadeOut(5000);
    },

    cancelCreateOnEscape: function(e) {
      if (e.keyCode != 27) return;
      this.cancelCreate();
    },

    createOnEnter: function(e) {
      if (e.keyCode != 13) return;
      this.create();
    },

    clear: function() {
      this.title.val('');
      this.url.val('');
      this.tags.val('');
    },

    create: function() {
      this.highlightNextAdd = true;
      var tags = Util.parseTags(this.tags.val());
      var res = Bookmarks.create({
        title: this.title.val(),
        url: this.url.val(),
        tags: tags,
      }, { error: this.showError });
      if (res) {
        this.cancelCreate();
      }
    },

    addOne: function(bk) {
      var view = new BookmarkView({model: bk});
      this.$("#bk-list").append(view.render().el);
      this.refreshCount();
      if (this.highlightNextAdd) {
        view.highlight();
        this.highlightNextAdd = false;
      }
    },

    addAll: function() {
      Bookmarks.each(this.addOne);
    },

    refreshCount: function() {
      var showing = Bookmarks.length - NotResultsIndexes.length;
      $("#bk-count").text("Showing " + showing + " / " + Bookmarks.length);
    },

    startCreate: function() {
      this.$("#create-bk").show("slow");
      this.$("#new_title").focus();
    },

    cancelCreate: function() {
      this.$("#create-bk").hide("fast");
      this.clear();
    },
  });
  window.App = new AppView;
});
