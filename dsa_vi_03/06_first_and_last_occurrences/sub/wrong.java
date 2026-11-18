// User function Template for Java

class GFG {
    ArrayList<Integer> find(int arr[], int x) {
        // code here
        int start = 0;
        int end = arr.length-1;
        while(start <= end){
            int mid = start + (end-start)/2;
            if(arr[mid] == x){
                end = mid-1;
            }
            else if(arr[mid] > x){
                end = mid-1;
            }
            else{
                start = mid+1;
            }
        }
        ArrayList<Integer> list = new ArrayList<>();
        if(end == -1){
            list.add(-1);
        }
        else{
            list.add(end+1);
        }
        start = 0;
        end = arr.length-1;
        while(start <= end){
            int mid = start + (end-start)/2;
            if(arr[mid] == x){
                start = mid+1;
            }
            else if(arr[mid] > x){
                end = mid-1;
            }
            else{
                start = mid+1;
            }
        }
        
        list.add(start-1);
        return list;
    }
}