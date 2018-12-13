
function PointValidator()
{
	// build array maps of the form inputs & control groups //
	this.formFields = [$('#email'), $('#amount')];
	this.controlGroups = [$('#email-cg'), $('#amount-cg')];

	// bind a simple alert window to this controller to display any errors //
	this.loginErrors = $('.modal-alert');
	
	this.showPointError = function(t, m)
	{
		$('.modal-alert .modal-header h4').text(t);
		$('.modal-alert .modal-body').html(m);
		this.loginErrors.modal('show');
	}
	this.validateEmail = function(e)
	{
		var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
		return re.test(e);
	}
}


PointValidator.prototype.showToSelf = function()
{
	this.showPointError('Whoops!','You can not send points to your self.');
}
PointValidator.prototype.showNotEmailNotFound = function()
{
	this.showPointError('Whoops!','Account with that email dose not exist.');
}

PointValidator.prototype.showNotEnoughPoints = function()
{
	this.showPointError('Whoops!', 'You don\'t have enough points in your balance.');
}

PointValidator.prototype.validateForm = function()
{
	if ($('#email').val() == ''){
		this.showPointError('Whoops!', 'Please enter a valid email');
		return false;
	}
	else if (this.validateEmail($('#email').val()) == false) {
		this.showPointError('Whoops!', 'Please enter a valid email');
		return false;
	}	
	else if ($('#amount').val() == '' || $('#amount').val() <= 0){
		this.showPointError('Whoops!', 'Please enter a valid points');
		return false;
	}
	else if (isNaN($('#amount').val())) {
		this.showPointError('Whoops!', 'Please enter a number value for points');
		return false;
	}
	else{
		return true;
	}
}