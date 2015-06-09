var Context = require('Context');

var dict = {
};

var log = document.createElement('ul');
log.style.position = 'absolute';
log.style.top = '7rem';
log.style.left = '1rem';
log.style.color = '#444';
log.style.font = '10px "Ubuntu Mono", monospace';
log.style.lineHeight = '1.5em';
log.style.listStyleType = 'none';

Context.canvas.parentNode.appendChild(log);

module.exports = {
  progress: function(id, percent) {
    if(!(id in dict)) {
      var li = document.createElement('li');
      log.appendChild(li);
      dict[id] = { fns: [], li: li, value: 0 };
    }

    dict[id].value = percent;

    if(percent >= 1) {
      dict[id].fns.forEach(function(i) {
        i();
      });
    }
  },
  subscribe: function(id, fn) {
    if(!(id in dict)) {
      var li = document.createElement('li');
      log.appendChild(li);
      dict[id] = { fns: [], li: li, value: 0 };
    }

    dict[id].fns.push(fn);
  
  },
  render: function() {
    for(var i in dict) {
      var pct = parseInt(dict[i].value * 100), sp = '' + pct;
      while(sp.length < 4) sp = '_' + sp;
      sp = sp.replace(/_/g, '&nbsp;');
      dict[i].li.innerHTML = '&nbsp;' + i + ': ' + sp + "%&nbsp;\n";
      var a = 'linear-gradient(90deg, #0f0, #0f0 ' + pct + '%, #0b0 ' + pct + '%)';
      dict[i].li.style.backgroundImage = a;

    }
  },
  remove: function() {
    Context.canvas.parentNode.removeChild(log);
  }
}
