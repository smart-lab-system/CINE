// User function Template for Java

class GFG {
    ArrayList<Integer> find(int arr[], int x) {
        // code here
        int low = 0, high = arr.length - 1;
        int mid = -1;

        ArrayList<Integer> list = new ArrayList<>();
        
        while(low <= high) {
            mid = (low + high) / 2;
            
            if(arr[mid] > x) high = mid - 1;
            else if(arr[mid] < x) low = mid + 1;
            else break;
        }
        
        if(mid == -1) {
            list.add(-1);
            list.add(-1);
            return list;
        }
        
        low = 0;
        int temp = mid;
        while(low <= high) {
            temp = (low + mid) / 2;
            
            if(arr[temp] > x) high = temp - 1;
            else if(arr[temp] < x) low = temp + 1;
            else high = temp - 1;
        }
        
        list.add(temp);
        
        high = arr.length - 1;
        while(mid <= high) {
            temp = (mid + high) / 2;
            
            if(arr[temp] > x) high = temp - 1;
            else if(arr[temp] < x) mid = temp + 1;
            else mid = temp + 1;
        }
        
        list.add(temp);
        
        return list;
    }
}